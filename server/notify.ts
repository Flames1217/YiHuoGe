import crypto from "node:crypto";
import nodemailer from "nodemailer";

export interface NotificationChannelPayload {
  id?: string;
  name?: string;
  type: string;
  enabled?: boolean;
  target?: string;
  secretMasked?: string;
  config?: Record<string, string>;
  template?: string;
}

export interface NotifySendResult {
  ok: true;
  provider: string;
  status?: number;
  messageId?: string;
  deliveredAt: string;
}

const title = "异火阁 · 空间通道试炼";

function fail(message: string): never {
  throw new Error(message);
}

function textOf(channel: NotificationChannelPayload) {
  return channel.template?.trim() || [
    "🔥【异火阁 · 空间通道试炼】",
    "当感知到此空间波动时，证明此空间通道稳定。",
    "阁令已达，异火未熄。",
    "收诸般异火，掌万般续期。",
  ].join("\n");
}

function requireValue(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!text) fail(`缺少 ${label}`);
  return text;
}

function parseJsonObject(value?: string) {
  if (!value?.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("Headers / Payload 必须是 JSON 对象");
  return parsed as Record<string, string>;
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    fail(`远端通道返回 ${response.status}${detail ? `：${detail.slice(0, 180)}` : ""}`);
  }
  return response;
}

async function assertProviderAccepted(response: Response, provider: string) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return;
  const data = await response.clone().json().catch(() => undefined) as
    | { ok?: boolean; errcode?: number; errmsg?: string; code?: number; msg?: string; StatusCode?: number; StatusMessage?: string }
    | undefined;
  if (!data) return;
  if (data.ok === false) fail(`${provider} 未收取试炼`);
  if (typeof data.errcode === "number" && data.errcode !== 0) fail(`${provider} 返回 ${data.errcode}${data.errmsg ? `：${data.errmsg}` : ""}`);
  if (typeof data.code === "number" && ![0, 200].includes(data.code)) fail(`${provider} 返回 ${data.code}${data.msg ? `：${data.msg}` : ""}`);
  if (typeof data.StatusCode === "number" && data.StatusCode !== 0) fail(`${provider} 返回 ${data.StatusCode}${data.StatusMessage ? `：${data.StatusMessage}` : ""}`);
}

async function sendWebhook(channel: NotificationChannelPayload, message: string, subject = title) {
  const url = requireValue(channel.target, "Webhook 地址");
  const method = (channel.config?.method || "POST").toUpperCase();
  const headers = parseJsonObject(channel.config?.headers);
  if (channel.secretMasked) headers.Authorization = headers.Authorization || `Bearer ${channel.secretMasked}`;
  const payloadTemplate = channel.config?.payload?.trim();
  const payload = payloadTemplate
    ? JSON.parse(payloadTemplate.replaceAll("{{message}}", message).replaceAll("{{title}}", subject))
    : { title: subject, text: message, source: "YiHuoGe" };
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  if (!response.ok) fail(`Webhook 返回 ${response.status}`);
  return response;
}

function dingtalkUrl(channel: NotificationChannelPayload) {
  const target = requireValue(channel.target, "钉钉 Webhook");
  if (target.startsWith("http")) return target;
  return `https://oapi.dingtalk.com/robot/send?access_token=${encodeURIComponent(target)}`;
}

function wecomUrl(channel: NotificationChannelPayload) {
  const target = requireValue(channel.target, "企业微信 Webhook / Key");
  if (target.startsWith("http")) return target;
  return `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(target)}`;
}

function feishuUrl(channel: NotificationChannelPayload) {
  const target = requireValue(channel.target, "飞书 Webhook");
  if (target.startsWith("http")) return target;
  return `https://open.feishu.cn/open-apis/bot/v2/hook/${encodeURIComponent(target)}`;
}

function splitList(value?: string) {
  return String(value ?? "")
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function sendNotificationTest(channel: NotificationChannelPayload, override?: { message?: string; subject?: string }): Promise<NotifySendResult> {
  const message = override?.message?.trim() || textOf(channel);
  const subject = override?.subject || title;
  const provider = channel.type;
  let response: Response | undefined;
  let messageId: string | undefined;

  switch (provider) {
    case "Email": {
      const smtpHost = requireValue(channel.config?.smtpHost, "SMTP 主机");
      const smtpPort = Number(channel.config?.smtpPort || 465);
      const user = channel.config?.smtpUser || channel.config?.from || "";
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: user && channel.secretMasked ? { user, pass: channel.secretMasked } : undefined,
      });
      const info = await transporter.sendMail({
        from: channel.config?.from || user,
        to: requireValue(channel.target, "收件邮箱"),
        subject,
        text: message,
      });
      messageId = info.messageId;
      break;
    }
    case "Telegram":
      response = await postJson(`https://api.telegram.org/bot${requireValue(channel.secretMasked, "Bot Token")}/sendMessage`, {
        chat_id: requireValue(channel.target, "Chat ID"),
        text: message,
        parse_mode: channel.config?.parseMode || undefined,
      });
      break;
    case "Discord":
      response = await postJson(requireValue(channel.target, "Discord Webhook"), { content: message, username: "异火阁" });
      break;
    case "Slack":
      response = await postJson(requireValue(channel.target, "Slack Webhook"), { text: message });
      break;
    case "Webhook":
    case "Custom":
      response = await sendWebhook(channel, message, subject);
      break;
    case "DingTalk": {
      let url = dingtalkUrl(channel);
      if (channel.secretMasked) {
        const timestamp = Date.now();
        const sign = crypto.createHmac("sha256", channel.secretMasked).update(`${timestamp}\n${channel.secretMasked}`).digest("base64");
        url += `${url.includes("?") ? "&" : "?"}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
      }
      response = await postJson(url, { msgtype: "text", text: { content: message } });
      break;
    }
    case "WeCom":
      response = await postJson(wecomUrl(channel), {
        msgtype: "text",
        text: { content: message, mentioned_list: splitList(channel.config?.mentionedList) },
      });
      break;
    case "Feishu": {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret = channel.secretMasked || "";
      const sign = secret ? crypto.createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64") : undefined;
      response = await postJson(feishuUrl(channel), {
        timestamp: sign ? timestamp : undefined,
        sign,
        msg_type: "text",
        content: { text: message },
      });
      break;
    }
    case "Bark": {
      const target = requireValue(channel.target, "Bark Server / Device Key");
      const url = target.startsWith("http") ? target : `https://api.day.app/${encodeURIComponent(target)}`;
      response = await postJson(url, { title: subject, body: message, group: channel.config?.group, sound: channel.config?.sound });
      break;
    }
    case "ServerChan": {
      const sendKey = requireValue(channel.target, "SendKey");
      response = await fetch(`https://sctapi.ftqq.com/${encodeURIComponent(sendKey)}.send`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ title: subject, desp: message }),
      });
      if (!response.ok) fail(`Server酱 返回 ${response.status}`);
      break;
    }
    case "PushPlus":
      response = await postJson("https://www.pushplus.plus/send", {
        token: requireValue(channel.target, "PushPlus Token"),
        title: subject,
        content: message,
        topic: channel.config?.topic,
      });
      break;
    case "ntfy": {
      const target = requireValue(channel.target, "ntfy Server / Topic");
      const url = target.startsWith("http") ? target : `https://ntfy.sh/${encodeURIComponent(target)}`;
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Title: subject,
          ...(channel.secretMasked ? { Authorization: `Bearer ${channel.secretMasked}` } : {}),
          ...(channel.config?.priority ? { Priority: channel.config.priority } : {}),
          ...(channel.config?.tags ? { Tags: channel.config.tags } : {}),
        },
        body: message,
      });
      if (!response.ok) fail(`ntfy 返回 ${response.status}`);
      break;
    }
    case "Gotify": {
      const server = requireValue(channel.target, "Gotify Server").replace(/\/$/, "");
      const token = requireValue(channel.secretMasked, "Application Token");
      response = await postJson(`${server}/message?token=${encodeURIComponent(token)}`, {
        title: subject,
        message,
        priority: Number(channel.config?.priority || 5),
      });
      break;
    }
    case "Pushover":
      response = await fetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: requireValue(channel.secretMasked, "Application Token"),
          user: requireValue(channel.target, "User / Group Key"),
          title: subject,
          message,
          priority: channel.config?.priority || "0",
        }),
      });
      if (!response.ok) fail(`Pushover 返回 ${response.status}`);
      break;
    case "Microsoft Teams":
      response = await postJson(requireValue(channel.target, "Teams Webhook"), { text: message });
      break;
    case "Google Chat":
      response = await postJson(requireValue(channel.target, "Google Chat Webhook"), { text: message });
      break;
    case "Matrix": {
      const homeserver = requireValue(channel.config?.homeserver, "Homeserver").replace(/\/$/, "");
      const roomId = encodeURIComponent(requireValue(channel.target, "Room ID"));
      const txn = crypto.randomUUID();
      response = await fetch(`${homeserver}/_matrix/client/v3/rooms/${roomId}/send/m.room.message/${txn}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireValue(channel.secretMasked, "Access Token")}` },
        body: JSON.stringify({ msgtype: "m.text", body: message }),
      });
      if (!response.ok) fail(`Matrix 返回 ${response.status}`);
      break;
    }
    case "Mattermost":
      response = await postJson(requireValue(channel.target, "Mattermost Webhook"), { text: message });
      break;
    case "Rocket.Chat":
      response = await postJson(requireValue(channel.target, "Rocket.Chat Webhook"), { text: message, alias: "异火阁" });
      break;
    case "Signal":
      response = await postJson(requireValue(channel.config?.endpoint, "Signal API Endpoint"), {
        message,
        recipients: splitList(channel.target),
      });
      break;
    case "LINE":
      response = await postJson("https://api.line.me/v2/bot/message/push", {
        to: requireValue(channel.target, "User / Group ID"),
        messages: [{ type: "text", text: message }],
      }, { Authorization: `Bearer ${requireValue(channel.secretMasked, "Channel Access Token")}` });
      break;
    case "Pushbullet":
      response = await postJson("https://api.pushbullet.com/v2/pushes", {
        type: "note",
        title,
        body: message,
        email: channel.target?.includes("@") ? channel.target : undefined,
        device_iden: channel.target && !channel.target.includes("@") ? channel.target : undefined,
      }, { "Access-Token": requireValue(channel.secretMasked, "Access Token") });
      break;
    case "AWS SNS":
      fail("AWS SNS 需要签名凭证适配，请先通过 Webhook / 自定义网关接入");
    case "Twilio":
      response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(requireValue(channel.config?.accountSid, "Account SID"))}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${requireValue(channel.config?.accountSid, "Account SID")}:${requireValue(channel.secretMasked, "Auth Token")}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: requireValue(channel.target, "接收号码"),
          From: requireValue(channel.config?.from, "发送号码"),
          Body: message,
        }),
      });
      if (!response.ok) fail(`Twilio 返回 ${response.status}`);
      break;
    default:
      fail(`暂不支持 ${provider} 的直连试炼`);
  }

  if (response) await assertProviderAccepted(response, provider);

  return {
    ok: true,
    provider,
    status: response?.status,
    messageId,
    deliveredAt: new Date().toISOString(),
  };
}



export interface NotificationDispatchPayload {
  channel: NotificationChannelPayload;
  asset: {
    id: string;
    name: string;
    type?: string;
    provider?: string;
    providerUrl?: string;
    hostProvider?: string;
    hostUrl?: string;
    account?: string;
    accountType?: string;
    renewalDate: string;
    price?: number;
    currency?: string;
    cycle: string;
    daysUntil: number;
  };
}

const assetTypeName: Record<string, string> = {
  domain: "域名",
  vps: "VPS",
  hosting: "虚拟主机",
  cloud: "虚拟主机",
  ai: "AI订阅",
  membership: "会员订阅",
  custom: "自定义",
};

const cycleName: Record<string, string> = {
  daily: "日付",
  weekly: "周付",
  monthly: "月付",
  quarterly: "季付",
  semiannual: "半年付",
  yearly: "年付",
  biennial: "2年付",
  triennial: "3年付",
  decennial: "10年付",
  lifetime: "永久",
  custom: "自定",
};

const currencySymbols: Record<string, string> = { CNY: "¥", USD: "$", EUR: "€", HKD: "HK$", JPY: "¥", GBP: "£" };

function blankFallback(value: unknown, fallback = "未填") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function priceText(price: unknown, currency: unknown) {
  const amount = Number(price ?? 0);
  const unit = String(currency ?? "CNY");
  const symbol = currencySymbols[unit] ?? `${unit} `;
  return `${symbol}${amount.toFixed(2)}`;
}

function serviceUrlText(asset: NotificationDispatchPayload["asset"]) {
  const urls = [
    asset.providerUrl ? `服务商地址：${asset.providerUrl}` : "",
    asset.hostUrl ? `托管地址：${asset.hostUrl}` : "",
  ].filter(Boolean);
  return urls.length ? urls.join("\n") : "服务商地址：未填";
}

function renewalMessage(asset: NotificationDispatchPayload["asset"]) {
  const days = Number(asset.daysUntil);
  const daysText = Number.isFinite(days) ? `${days}天后` : "永久";
  const typeText = assetTypeName[asset.type ?? ""] ?? blankFallback(asset.type, "自定义");
  const cycleText = cycleName[asset.cycle] ?? blankFallback(asset.cycle, "自定");
  const accountText = asset.account || asset.accountType
    ? `账号/标识：${[asset.accountType, asset.account].filter(Boolean).join(" · ")}`
    : "";
  return [
    "【异火阁 · 续期提醒】",
    `资产名称：${blankFallback(asset.name)}`,
    `资产类型：${typeText}`,
    `价格：${priceText(asset.price, asset.currency)}`,
    `续期日：${blankFallback(asset.renewalDate)}（${daysText}）`,
    `周期：${cycleText}`,
    `服务商：${blankFallback(asset.provider)}`,
    asset.hostProvider ? `托管服务：${asset.hostProvider}` : "",
    accountText,
    serviceUrlText(asset),
    "",
    "收诸般异火，掌万般续期。",
    "——异火阁",
  ].filter((line) => line !== "").join("\n");
}

export async function sendNotificationDispatch(payload: NotificationDispatchPayload): Promise<NotifySendResult> {
  const { channel, asset } = payload;
  return sendNotificationTest(channel, { message: renewalMessage(asset), subject: "【异火阁】续期提醒" });
}
