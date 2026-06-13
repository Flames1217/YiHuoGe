import {
  ApiOutlined,
  AppstoreOutlined,
  BellOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  GlobalOutlined,
  ImportOutlined,
  LayoutOutlined,
  LockOutlined,
  PlusOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  ConfigProvider,
  Divider,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { providerPresets } from "./data/mock";
import { useYiHuoStore } from "./store";
import type { Asset, AssetStatus, AssetType, BackupTarget, Language, NotificationChannel, NotifyType, ViewMode } from "./types";
import { daysUntil, topbarDate } from "./utils/calendar";

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const ADMIN_KEY_STORAGE = "yihuoge-admin-key";

type AccessState = "checking" | "locked" | "unlocked";

async function verifyAdminKey(key: string) {
  const response = await fetch("/api/auth/verify", {
    method: "POST",
    headers: key ? { "x-admin-key": key } : undefined,
  });
  return response.ok;
}

async function hydrateFromServer(key: string) {
  const response = await fetch("/api/bootstrap", {
    headers: key ? { "x-admin-key": key } : undefined,
  });
  if (!response.ok) return;
  const data = await response.json();
  useYiHuoStore.setState((state) => ({
    assets: Array.isArray(data.assets) ? data.assets : state.assets,
    domains: Array.isArray(data.domains) ? data.domains : state.domains,
    channels: Array.isArray(data.channels) ? data.channels : state.channels,
    aiConfig: data.ai ? { ...state.aiConfig, ...data.ai } : state.aiConfig,
    settings: data.settings ? { ...state.settings, ...data.settings } : state.settings,
  }));
}

const statusTone: Record<AssetStatus, string> = {
  healthy: "success",
  warning: "warning",
  critical: "error",
  expired: "default",
};

const typeTone: Record<AssetType, string> = {
  domain: "volcano",
  vps: "geekblue",
  cloud: "cyan",
  ai: "purple",
  membership: "gold",
  custom: "default",
};

const assetTypeName: Record<AssetType, string> = {
  domain: "域名",
  vps: "云主机",
  cloud: "云服务",
  ai: "智能订阅",
  membership: "会员订阅",
  custom: "自定义",
};

const cycleName: Record<Asset["cycle"], string> = {
  monthly: "月付",
  yearly: "年付",
  custom: "自定",
};

const moduleName: Record<string, string> = {
  overview: "阁内总览",
  assets: "异火库",
  notifications: "通知功法",
  ai: "AI 炼化",
  settings: "设置",
};

const moduleKeys = ["overview", "assets", "notifications", "ai", "settings"];

const aiProviderOptions = [
  { value: "OpenAI Compatible", label: "OpenAI Compatible", baseUrl: "https://api.openai.com/v1" },
  { value: "OpenAI", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { value: "Azure OpenAI", label: "Azure OpenAI", baseUrl: "https://{resource}.openai.azure.com/openai" },
  { value: "Google Gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { value: "Anthropic Claude", label: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1" },
  { value: "DeepSeek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { value: "xAI Grok", label: "xAI Grok", baseUrl: "https://api.x.ai/v1" },
  { value: "Mistral AI", label: "Mistral AI", baseUrl: "https://api.mistral.ai/v1" },
  { value: "Cohere", label: "Cohere", baseUrl: "https://api.cohere.com/v2" },
  { value: "Groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { value: "OpenRouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { value: "Together AI", label: "Together AI", baseUrl: "https://api.together.xyz/v1" },
  { value: "Perplexity", label: "Perplexity", baseUrl: "https://api.perplexity.ai" },
  { value: "Fireworks AI", label: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1" },
  { value: "Alibaba DashScope / Qwen", label: "Alibaba DashScope / Qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { value: "Moonshot AI / Kimi", label: "Moonshot AI / Kimi", baseUrl: "https://api.moonshot.ai/v1" },
  { value: "Zhipu AI / GLM", label: "Zhipu AI / GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { value: "AWS Bedrock", label: "AWS Bedrock", baseUrl: "" },
  { value: "Ollama", label: "Ollama", baseUrl: "http://localhost:11434/v1" },
  { value: "LM Studio", label: "LM Studio", baseUrl: "http://localhost:1234/v1" },
  { value: "Custom OpenAI Compatible", label: "Custom OpenAI Compatible", baseUrl: "" },
];

const timezoneOptions = [
  { value: "Asia/Shanghai", label: "亚洲/上海" },
  { value: "Asia/Tokyo", label: "亚洲/东京" },
  { value: "Asia/Singapore", label: "亚洲/新加坡" },
  { value: "Asia/Hong_Kong", label: "亚洲/香港" },
  { value: "Europe/London", label: "欧洲/伦敦" },
  { value: "Europe/Berlin", label: "欧洲/柏林" },
  { value: "America/New_York", label: "美洲/纽约" },
  { value: "America/Los_Angeles", label: "美洲/洛杉矶" },
  { value: "UTC", label: "协调世界时" },
];

const currencySymbols: Record<string, string> = {
  CNY: "\u00a5",
  USD: "$",
  EUR: "\u20ac",
  JPY: "\u00a5",
  HKD: "HK$",
  GBP: "\u00a3",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  CHF: "CHF",
  KRW: "\u20a9",
  TWD: "NT$",
  NZD: "NZ$",
  INR: "\u20b9",
};

const currencyOptions = Object.keys(currencySymbols).map((value) => ({
  value,
  label: `${value} ${currencySymbols[value]}`,
}));

const currencyRatesToCny: Record<string, number> = {
  CNY: 1,
  USD: 7.25,
  EUR: 7.85,
  JPY: 0.046,
  HKD: 0.93,
  GBP: 9.2,
  AUD: 4.75,
  CAD: 5.28,
  SGD: 5.38,
  CHF: 8.1,
  KRW: 0.0052,
  TWD: 0.23,
  NZD: 4.35,
  INR: 0.087,
};

const backupTypeName: Record<BackupTarget["type"], string> = {
  WebDAV: "网盘协议",
  S3: "对象存储",
  GitJson: "Git 仓库 JSON",
};

const themePalettes = {
  "dark-fire": {
    primary: "#f59e0b",
    primary2: "#ffb84d",
    accent: "#f97316",
    bg: "#0b0b0f",
    text: "#f7efe0",
  },
  "abyss-purple": {
    primary: "#8b5cf6",
    primary2: "#c4b5fd",
    accent: "#f59e0b",
    bg: "#090713",
    text: "#f4efff",
  },
  "ink-gold": {
    primary: "#d6a84f",
    primary2: "#ffe4a3",
    accent: "#2dd4bf",
    bg: "#070909",
    text: "#fff7df",
  },
};

const channelTypeName: Record<NotifyType, string> = {
  Email: "Email",
  Telegram: "Telegram",
  Discord: "Discord",
  Slack: "Slack",
  Webhook: "Webhook",
  DingTalk: "\u9489\u9489",
  WeCom: "\u4f01\u4e1a\u5fae\u4fe1",
  Feishu: "\u98de\u4e66",
  Bark: "Bark",
  ServerChan: "Server\u9171",
  PushPlus: "PushPlus",
  ntfy: "ntfy",
  Gotify: "Gotify",
  Pushover: "Pushover",
  "Microsoft Teams": "Microsoft Teams",
  "Google Chat": "Google Chat",
  Matrix: "Matrix",
  Mattermost: "Mattermost",
  "Rocket.Chat": "Rocket.Chat",
  Signal: "Signal",
  LINE: "LINE",
  Pushbullet: "Pushbullet",
  "AWS SNS": "AWS SNS",
  Twilio: "Twilio",
  Custom: "Custom",
};

const notifyTypes: NotifyType[] = [
  "Email",
  "Telegram",
  "Discord",
  "Slack",
  "Webhook",
  "DingTalk",
  "WeCom",
  "Feishu",
  "Bark",
  "ServerChan",
  "PushPlus",
  "ntfy",
  "Gotify",
  "Pushover",
  "Microsoft Teams",
  "Google Chat",
  "Matrix",
  "Mattermost",
  "Rocket.Chat",
  "Signal",
  "LINE",
  "Pushbullet",
  "AWS SNS",
  "Twilio",
  "Custom",
];

type NotifyFieldName = "target" | "secretMasked" | `config.${string}`;

interface NotifyFieldPreset {
  name: NotifyFieldName;
  label: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
  secret?: boolean;
  multiline?: boolean;
  options?: Array<{ value: string; label: string }>;
}

interface NotifyPreset {
  summary: string;
  fields: NotifyFieldPreset[];
}

const fieldName = (name: NotifyFieldName) => (name.startsWith("config.") ? ["config", name.slice(7)] : name);

const webhookField = (label = "Webhook URL", placeholder = "https://..."): NotifyFieldPreset => ({
  name: "target",
  label,
  placeholder,
  required: true,
});

const tokenField = (label = "Token / Secret", placeholder = "***"): NotifyFieldPreset => ({
  name: "secretMasked",
  label,
  placeholder,
  required: true,
  secret: true,
});

const notifyPresets: Record<NotifyType, NotifyPreset> = {
  Email: {
    summary: "适合个人邮箱、团队邮箱或 SMTP 服务商。",
    fields: [
      { name: "target", label: "收件邮箱", placeholder: "ops@example.com", required: true },
      { name: "config.from", label: "发件邮箱", placeholder: "YiHuoGe <noreply@example.com>" },
      { name: "config.smtpHost", label: "SMTP 主机", placeholder: "smtp.example.com", required: true },
      { name: "config.smtpPort", label: "SMTP 端口", placeholder: "465 / 587" },
      { name: "config.smtpUser", label: "SMTP 用户名", placeholder: "noreply@example.com" },
      { name: "secretMasked", label: "SMTP 密码 / App Password", placeholder: "***", secret: true },
    ],
  },
  Telegram: {
    summary: "使用 Telegram Bot Token 与 Chat ID 推送到个人、群组或频道。",
    fields: [
      { name: "target", label: "Chat ID", placeholder: "-1001234567890 / 123456789", required: true },
      { name: "secretMasked", label: "Bot Token", placeholder: "123456:ABC-DEF...", required: true, secret: true },
      { name: "config.parseMode", label: "Parse Mode", placeholder: "Markdown / HTML" },
    ],
  },
  Discord: { summary: "使用 Discord Incoming Webhook 发送到指定频道。", fields: [webhookField("Discord Webhook URL", "https://discord.com/api/webhooks/...")] },
  Slack: { summary: "使用 Slack Incoming Webhook 发送到工作区频道。", fields: [webhookField("Slack Webhook URL", "https://hooks.slack.com/services/...")] },
  Webhook: {
    summary: "通用 HTTP Webhook，适合接入自建机器人、自动化平台或网关。",
    fields: [
      webhookField("请求地址", "https://example.com/webhook"),
      { name: "config.method", label: "请求方法", placeholder: "POST", options: [{ value: "POST", label: "POST" }, { value: "PUT", label: "PUT" }, { value: "PATCH", label: "PATCH" }] },
      { name: "config.headers", label: "额外 Headers（JSON）", placeholder: "{\"Authorization\":\"Bearer ...\"}", multiline: true },
      { name: "secretMasked", label: "签名密钥 / Bearer Token", placeholder: "可选", secret: true },
    ],
  },
  DingTalk: {
    summary: "钉钉群机器人，支持关键词或加签安全设置。",
    fields: [webhookField("钉钉机器人 Webhook", "https://oapi.dingtalk.com/robot/send?access_token=..."), { name: "config.keyword", label: "安全关键词", placeholder: "异火阁" }, tokenField("加签 Secret", "SEC...")],
  },
  WeCom: {
    summary: "企业微信群机器人，可填写完整 Webhook 或机器人 Key。",
    fields: [webhookField("企业微信机器人 Webhook / Key", "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."), { name: "config.mentionedList", label: "提醒成员", placeholder: "@all / userid1,userid2" }],
  },
  Feishu: {
    summary: "飞书群机器人，支持签名校验。",
    fields: [webhookField("飞书机器人 Webhook", "https://open.feishu.cn/open-apis/bot/v2/hook/..."), tokenField("签名密钥", "可选")],
  },
  Bark: {
    summary: "iOS Bark 推送，可接入官方或自建 Bark Server。",
    fields: [webhookField("Bark Server / Device Key", "https://api.day.app/your-key"), { name: "config.group", label: "分组", placeholder: "YiHuoGe" }, { name: "config.sound", label: "提示音", placeholder: "bell" }],
  },
  ServerChan: { summary: "Server酱 SendKey 推送到微信。", fields: [{ name: "target", label: "SendKey", placeholder: "SCT...", required: true, secret: true }] },
  PushPlus: { summary: "PushPlus 微信推送，支持群组 Topic。", fields: [{ name: "target", label: "Token", placeholder: "pushplus token", required: true, secret: true }, { name: "config.topic", label: "Topic / 群组编码", placeholder: "可选" }] },
  ntfy: { summary: "ntfy 主题推送，适合自托管轻量通知。", fields: [{ name: "target", label: "Server / Topic", placeholder: "https://ntfy.sh/yihuoge 或 yihuoge", required: true }, { name: "config.priority", label: "Priority", placeholder: "default / high / urgent" }, { name: "config.tags", label: "Tags", placeholder: "fire,renewal" }, tokenField("Access Token", "可选")] },
  Gotify: { summary: "Gotify 自托管推送服务。", fields: [webhookField("Gotify Server", "https://gotify.example.com"), tokenField("Application Token", "***"), { name: "config.priority", label: "Priority", placeholder: "5" }] },
  Pushover: { summary: "Pushover 移动端推送。", fields: [{ name: "target", label: "User / Group Key", placeholder: "u...", required: true }, tokenField("Application Token", "a..."), { name: "config.priority", label: "Priority", placeholder: "0 / 1 / 2" }] },
  "Microsoft Teams": { summary: "Teams Incoming Webhook / Workflow URL。", fields: [webhookField("Teams Webhook URL", "https://...webhook.office.com/...")] },
  "Google Chat": { summary: "Google Chat Space Webhook。", fields: [webhookField("Google Chat Webhook URL", "https://chat.googleapis.com/v1/spaces/...")] },
  Matrix: { summary: "Matrix 房间通知，适合自托管 Synapse / Element。", fields: [{ name: "target", label: "Room ID", placeholder: "!room:matrix.org", required: true }, { name: "config.homeserver", label: "Homeserver", placeholder: "https://matrix.org" }, tokenField("Access Token", "***")] },
  Mattermost: { summary: "Mattermost Incoming Webhook。", fields: [webhookField("Mattermost Webhook URL", "https://mattermost.example.com/hooks/...")] },
  "Rocket.Chat": { summary: "Rocket.Chat Incoming Webhook。", fields: [webhookField("Rocket.Chat Webhook URL", "https://chat.example.com/hooks/...")] },
  Signal: { summary: "Signal 网关或 signal-cli REST API。", fields: [{ name: "config.endpoint", label: "Signal API Endpoint", placeholder: "http://signal-cli-rest-api:8080/v2/send" }, { name: "target", label: "Recipient / Group ID", placeholder: "+8613800000000 / group-id", required: true }] },
  LINE: { summary: "LINE Messaging API 推送。", fields: [{ name: "target", label: "User / Group ID", placeholder: "U... / C...", required: true }, tokenField("Channel Access Token", "***")] },
  Pushbullet: { summary: "Pushbullet 推送到设备或账号。", fields: [{ name: "target", label: "Device / Email", placeholder: "device iden / user@example.com" }, tokenField("Access Token", "***")] },
  "AWS SNS": { summary: "AWS SNS Topic 推送。", fields: [{ name: "target", label: "Topic ARN", placeholder: "arn:aws:sns:ap-east-1:123:topic", required: true }, { name: "config.region", label: "Region", placeholder: "ap-east-1" }, { name: "config.accessKeyId", label: "Access Key ID", placeholder: "AKIA..." }, tokenField("Secret Access Key", "***")] },
  Twilio: { summary: "Twilio SMS / WhatsApp 通知。", fields: [{ name: "target", label: "接收号码", placeholder: "+8613800000000", required: true }, { name: "config.from", label: "发送号码", placeholder: "+1234567890" }, { name: "config.accountSid", label: "Account SID", placeholder: "AC..." }, tokenField("Auth Token", "***")] },
  Custom: { summary: "自定义渠道，按你的网关要求填写。", fields: [webhookField("入口地址", "https://example.com/notify"), { name: "config.payload", label: "默认 Payload（JSON）", placeholder: "{\"text\":\"{{message}}\"}", multiline: true }, tokenField("密钥 / Token", "可选")] },
};

function defaultNotifyTemplate(_type: NotifyType) {
  return [
    "🔥【异火阁 · 空间通道试炼】",
    "当感知到此空间波动时，证明此空间通道稳定。",
    "阁令已达，异火未熄。",
    "收诸般异火，掌万般续期。",
  ].join("\n");
}

const assetTypes: AssetType[] = ["domain", "vps", "cloud", "ai", "membership", "custom"];

const heavenlyFlames = [
  "帝炎",
  "虚无吞炎",
  "净莲妖火",
  "金帝焚天炎",
  "生灵之焱",
  "八荒破灭焱",
  "九幽金祖火",
  "红莲业火",
  "三千焱炎火",
  "九幽风炎",
  "骨灵冷火",
  "九龙雷罡火",
  "龟灵地火",
  "陨落心炎",
  "海心焰",
  "火云水炎",
  "火山石焰",
  "风雷怒焱",
  "青莲地心火",
  "幽冥毒火",
  "阴阳双炎",
  "万兽灵火",
  "玄黄炎",
];

function statusLabel(status: AssetStatus, t: (key: string) => string) {
  return <Tag className={`flame-tag flame-${status}`} color={statusTone[status]} icon={status === "healthy" ? <CheckCircleOutlined /> : <FireOutlined />}>{t(status)}</Tag>;
}

function dayUnit(date: string) {
  return `${daysUntil(date)} 天`;
}

function whoisStatusName(status: string) {
  const map: Record<string, string> = {
    clientTransferProhibited: "禁止转移",
    autoRenewPeriod: "自动续期宽限",
    ok: "正常",
  };
  return map[status] ?? status;
}

function convertCurrency(amount: number, from: string, to: string) {
  const fromRate = currencyRatesToCny[from] ?? 1;
  const toRate = currencyRatesToCny[to] ?? 1;
  return (amount * fromRate) / toRate;
}

function formatPreferredAmount(amount: number, from: string, preferred: string) {
  const converted = convertCurrency(amount, from, preferred);
  const symbol = currencySymbols[preferred] ?? "";
  return `${symbol}${converted.toFixed(2)}`;
}

function splitAssetCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && (char === "," || char === "\t")) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeAssetDate(value?: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return dayjs().add(1, "year").format("YYYY-MM-DD");
  const parsed = dayjs(raw.replace(/[./\u5e74]/g, "-").replace(/\u6708/g, "-").replace(/\u65e5/g, ""));
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : dayjs().add(1, "year").format("YYYY-MM-DD");
}

function inferAssetType(row: Record<string, string>, fallback?: string): AssetType {
  const raw = [fallback, row["\u7c7b\u578b"], row["\u7c7b\u522b"], row["\u8d44\u4ea7\u7c7b\u578b"], row["\u57df\u540d"] ? "\u57df\u540d" : ""].filter(Boolean).join(" ");
  const chineseTypeMap: Array<[RegExp, AssetType]> = [
    [/\u57df\u540d|domain/i, "domain"],
    [/vps|\u4e91\u4e3b\u673a|\u670d\u52a1\u5668|\u4e3b\u673a/i, "vps"],
    [/\u4e91\u670d\u52a1|cloud/i, "cloud"],
    [/AI|\u667a\u80fd|\u6a21\u578b|OpenAI|Claude|Gemini/i, "ai"],
    [/\u4f1a\u5458|\u8ba2\u9605|membership/i, "membership"],
  ];
  return chineseTypeMap.find(([pattern]) => pattern.test(raw))?.[1] ?? "custom";
}

function normalizeImportedAsset(item: Partial<Asset> & Record<string, unknown>, index: number): Asset {
  const row = item as Record<string, string>;
  const name = String(item.name ?? row["\u540d\u79f0"] ?? row["\u57df\u540d"] ?? row["\u7ba1\u7406\u540e\u53f0"] ?? `\u70bc\u5316\u8d44\u4ea7 ${index + 1}`).trim();
  const provider = String(item.provider ?? row["\u670d\u52a1\u5546"] ?? row["\u5e73\u53f0"] ?? row["\u6ce8\u518c\u5546"] ?? row["\u5730\u533a"] ?? "\u81ea\u5b9a\u4e49").trim();
  const url = String(item.url ?? row["\u7ba1\u7406\u5730\u5740"] ?? row["\u7ba1\u7406\u540e\u53f0"] ?? row["\u540e\u53f0"] ?? row["\u63a7\u5236\u53f0"] ?? "").trim();
  const account = String(item.account ?? row["\u8d26\u53f7"] ?? row["\u8d26\u6237"] ?? row["IP\u5730\u5740"] ?? "\u70bc\u5316\u5bfc\u5165").trim();
  const renewalDate = normalizeAssetDate(String(item.renewalDate ?? row["\u7eed\u671f\u65e5"] ?? row["\u7eed\u671f\u65e5\u671f"] ?? row["\u5230\u671f\u65f6\u95f4"] ?? row["\u5230\u671f\u65e5\u671f"] ?? ""));
  const price = Number(item.price ?? row["\u4ef7\u683c"] ?? row["\u8d39\u7528"] ?? row["\u91d1\u989d"] ?? 0) || 0;
  const type = inferAssetType(row, item.type as string | undefined);
  const notes = [item.notes, row["\u5907\u6ce8"], row["\u72b6\u6001"] ? `\u539f\u72b6\u6001\uff1a${row["\u72b6\u6001"]}` : "", row["\u5bc6\u7801"] ? "\u539f\u8868\u5305\u542b\u5bc6\u7801\u5217\uff0c\u5df2\u907f\u514d\u5c55\u793a\u660e\u6587\u3002" : ""].filter(Boolean).join("\n");
  return {
    id: String(item.id ?? `import-${Date.now()}-${index}`),
    name: name || `\u70bc\u5316\u8d44\u4ea7 ${index + 1}`,
    type,
    provider: provider || "\u81ea\u5b9a\u4e49",
    account,
    renewalDate,
    price,
    currency: String(item.currency ?? row["\u8d27\u5e01"] ?? "CNY"),
    cycle: (item.cycle === "monthly" || item.cycle === "yearly" || item.cycle === "custom" ? item.cycle : "custom") as Asset["cycle"],
    status: "healthy",
    url,
    tags: Array.isArray(item.tags) ? item.tags : ["AI\u70bc\u5316"],
    notes: notes || "\u7531 AI \u70bc\u5316/\u6279\u91cf\u5bfc\u5165\u5411\u5bfc\u751f\u6210\uff0c\u53ef\u7ee7\u7eed\u7f16\u8f91\u3002",
  };
}

function parseImportedAssets(text: string): Asset[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const first = splitAssetCsvLine(lines[0]);
  const hasHeader = first.some((cell) => ["\u540d\u79f0", "\u57df\u540d", "\u7ba1\u7406\u540e\u53f0", "\u5230\u671f\u65f6\u95f4", "\u5e73\u53f0", "\u8d26\u53f7", "\u670d\u52a1\u5546", "\u7c7b\u578b"].includes(cell));
  if (hasHeader) {
    return lines.slice(1).map((line, index) => {
      const cells = splitAssetCsvLine(line);
      const row = Object.fromEntries(first.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
      return normalizeImportedAsset(row, index);
    }).filter((asset) => asset.name && !asset.name.startsWith("\u70bc\u5316\u8d44\u4ea7"));
  }
  return lines.map((line, index) => {
    const parts = splitAssetCsvLine(line);
    const [name, type, provider, renewalDate, price, url] = parts;
    return normalizeImportedAsset({ name, type: type as AssetType, provider, renewalDate, price: Number(price) || 0, url }, index);
  });
}

async function lookupDomainWhois(domain: string) {
  const response = await fetch(`/api/whois/${encodeURIComponent(domain)}`);
  if (!response.ok) throw new Error("WHOIS 查询失败");
  return (await response.json()) as Partial<{
    name: string;
    registrar: string;
    createdAt: string;
    expiresAt: string;
    dns: string[];
    whoisStatus: string[];
  }>;
}

function useFilteredAssets(globalSearch = "") {
  const assets = useYiHuoStore((state) => state.assets);
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState<AssetType | "all">("all");
  useEffect(() => {
    if (globalSearch) setKeyword(globalSearch);
  }, [globalSearch]);
  const filtered = useMemo(() => {
    const lower = keyword.toLowerCase();
    return assets.filter((asset) => {
      const matchesType = type === "all" || asset.type === type;
      const matchesText = [asset.name, asset.provider, asset.account, asset.tags.join(" ")].join(" ").toLowerCase().includes(lower);
      return matchesType && matchesText;
    });
  }, [assets, keyword, type]);
  return { filtered, keyword, setKeyword, type, setType };
}

function AccessGate({
  initialKey,
  checking,
  onUnlock,
}: {
  initialKey: string;
  checking: boolean;
  onUnlock: (key: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState(initialKey);
  const [loading, setLoading] = useState(false);
  const [api, contextHolder] = message.useMessage();

  const submit = async () => {
    setLoading(true);
    const ok = await onUnlock(key.trim());
    setLoading(false);
    if (!ok) api.error(t("accessError"));
  };

  return (
    <main className="access-page">
      {contextHolder}
      <section className="access-card">
        <div className="access-copy">
          <div className="access-logo-ring">
            <img src="/logo.png" alt="异火阁" className="access-logo" />
          </div>
          <div className="eyebrow access-eyebrow"><LockOutlined /> {t("accessEyebrow")}</div>
          <Title level={1}>{t("accessTitle")}</Title>
          <Paragraph className="access-mantra">{t("accessSubtitle")}</Paragraph>
          <div className="access-runes" aria-label="YiHuoGe capabilities">
            <span>{t("metricAssets")}</span>
            <span>{t("metricChannels")}</span>
            <span>{t("aiImport")}</span>
          </div>
        </div>

        <div className="access-panel">
          <Title level={2}>{t("accessPanelTitle")}</Title>
          <Space.Compact className="access-input">
            <Input.Password
              value={key}
              onChange={(event) => setKey(event.target.value)}
              onPressEnter={submit}
              placeholder={t("accessPlaceholder")}
              disabled={checking || loading}
            />
            <Button type="primary" loading={checking || loading} onClick={submit} disabled={!key.trim()}>
              {checking ? t("checking") : t("enterForge")}
            </Button>
          </Space.Compact>
          <Text className="access-hint">{t("accessHint")}</Text>
          <div className="access-seals" aria-hidden="true">
            <span>异火阁令</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function OverviewModule({
  setActive,
  onQuickAdd,
}: {
  setActive: (key: string) => void;
  onQuickAdd: () => void;
}) {
  const { t } = useTranslation();
  const assets = useYiHuoStore((state) => state.assets);
  const channels = useYiHuoStore((state) => state.channels);
  const settings = useYiHuoStore((state) => state.settings);
  const urgent = assets.filter((asset) => daysUntil(asset.renewalDate) <= 14);
  const monthlyCost = assets.reduce((sum, asset) => sum + convertCurrency(asset.price, asset.currency, settings.currency), 0);
  const healthPercent = Math.round((assets.filter((asset) => asset.status === "healthy").length / Math.max(assets.length, 1)) * 100);

  return (
    <div className="module-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow"><FireOutlined /> 异火阁</div>
          <Title level={1}>{t("heroTitle")}</Title>
          <Paragraph className="hero-mantra">{t("heroMantra")}</Paragraph>
          <Text className="muted">{t("heroDesc")}</Text>
          <Space wrap className="hero-actions">
            <Button title="收录一枚域名、云主机、订阅或自定义火种" type="primary" icon={<PlusOutlined />} onClick={onQuickAdd}>{t("addAsset")}</Button>
            <Button title="进入 AI 炼化炉，将文本与表格炼成资产火种" icon={<ImportOutlined />} onClick={() => setActive("ai")}>{t("aiImport")}</Button>
          </Space>
        </div>
        <div className="hero-visual" aria-label="异火榜续期告警">
          <div className="flame-orb">
            <span />
            <strong>{urgent.length}</strong>
            <em>{t("urgentFlame")}</em>
          </div>
        </div>
      </section>

      <Row gutter={[18, 18]}>
        <Col xs={24} md={12} xl={6}><Card className="metric-card"><Statistic title={t("metricAssets")} value={assets.length} prefix={<AppstoreOutlined />} /></Card></Col>
        <Col xs={24} md={12} xl={6}><Card className="metric-card"><Statistic title={t("metricUrgent")} value={urgent.length} styles={{ content: { color: "#ffb84d" } }} prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col xs={24} md={12} xl={6}><Card className="metric-card"><Statistic title={t("metricBudget")} value={monthlyCost} precision={2} prefix={<DatabaseOutlined />} suffix={currencySymbols[settings.currency] ?? settings.currency} /></Card></Col>
        <Col xs={24} md={12} xl={6}><Card className="metric-card"><Statistic title={t("metricChannels")} value={channels.filter((item) => item.enabled).length} suffix={`/ ${channels.length}`} prefix={<BellOutlined />} /></Card></Col>
      </Row>

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={14}>
          <Card className="yhg-card" title="续期态势">
            <Progress percent={healthPercent} strokeColor={{ "0%": "#b91c1c", "60%": "#f59e0b", "100%": "#2dd4bf" }} />
            <div className="timeline-list">
              {assets
                .slice()
                .sort((a, b) => dayjs(a.renewalDate).valueOf() - dayjs(b.renewalDate).valueOf())
                .slice(0, 6)
                .map((asset) => (
                  <button className="timeline-row" key={asset.id} onClick={() => setActive("assets")}>
                    <span>{asset.name}</span>
                    <Tag color={daysUntil(asset.renewalDate) <= 14 ? "error" : "gold"}>{dayUnit(asset.renewalDate)}</Tag>
                    <Text>{asset.renewalDate}</Text>
                  </button>
                ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card className="yhg-card flame-board-card" title="异火榜">
            <div className="flame-board">
              {heavenlyFlames.map((name, index) => (
                <div className="flame-board-row" key={name}>
                  <span className="flame-rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="flame-name">{name}</span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function AssetDrawer({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing?: Asset;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<Asset>();
  const addAsset = useYiHuoStore((state) => state.addAsset);
  const updateAsset = useYiHuoStore((state) => state.updateAsset);
  const preferredCurrency = useYiHuoStore((state) => state.settings.currency);
  const [api, contextHolder] = message.useMessage();

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        editing ?? {
          type: "domain",
          provider: "火网注册局",
          account: "",
          renewalDate: dayjs().add(30, "day").format("YYYY-MM-DD"),
          price: 0,
          currency: preferredCurrency,
          cycle: "monthly",
          tags: [],
        },
      );
    }
  }, [editing, form, open, preferredCurrency]);

  const fillWhois = async () => {
    const name = form.getFieldValue("name");
    const type = form.getFieldValue("type");
    if (type !== "domain" || !name) return;
    try {
      const whois = await lookupDomainWhois(name);
      const patch: Partial<Asset> = {
        renewalDate: whois.expiresAt,
        provider: whois.registrar,
        notes: [
          whois.createdAt ? `WHOIS 创建日期：${whois.createdAt}` : "",
          whois.dns?.length ? `DNS：${whois.dns.join("、")}` : "",
          whois.whoisStatus?.length ? `状态：${whois.whoisStatus.map(whoisStatusName).join("、")}` : "",
        ].filter(Boolean).join("\n"),
      };
      form.setFieldsValue(patch);
      api.success("WHOIS 占验已成，到期灵纹已刻入续期日");
    } catch {
      api.warning("WHOIS 灵镜暂隐，请手动校准续期日");
    }
  };

  const submit = async () => {
    let values = await form.validateFields();
    if (values.type === "domain" && values.name) {
      try {
        const whois = await lookupDomainWhois(values.name);
        values = {
          ...values,
          renewalDate: whois.expiresAt || values.renewalDate,
          provider: whois.registrar || values.provider,
          notes: [
            values.notes,
            whois.createdAt ? `WHOIS 创建日期：${whois.createdAt}` : "",
            whois.dns?.length ? `DNS：${whois.dns.join("、")}` : "",
            whois.whoisStatus?.length ? `状态：${whois.whoisStatus.map(whoisStatusName).join("、")}` : "",
          ].filter(Boolean).join("\n"),
        };
        api.success("域名 WHOIS 已验真，续期日已按到期灵纹写入");
      } catch {
        api.warning("WHOIS 占验未成，已依当前续期日封存");
      }
    }
    if (editing) {
      updateAsset({ ...editing, ...values });
      api.success("资产火种已重铸");
    } else {
      addAsset(values);
      api.success("资产火种已收入异火阁");
    }
    onClose();
  };

  return (
    <Drawer size="large" open={open} onClose={onClose} title={editing ? "编辑资产" : t("addAsset")} extra={<Button title="封存当前火种；域名类型会先占验 WHOIS" type="primary" onClick={submit}>保存</Button>}>
      {contextHolder}
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input onBlur={fillWhois} placeholder="例如：yihuoge.dev / 开放智能接口额度" /></Form.Item>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="type" label="类型"><Select options={assetTypes.map((value) => ({ value, label: assetTypeName[value] }))} /></Form.Item></Col>
          <Col span={12}><Form.Item name="provider" label={t("provider")}><Select showSearch options={providerPresets.map((value) => ({ value, label: value }))} /></Form.Item></Col>
        </Row>
        <Form.Item name="account" label={t("account")}><Input /></Form.Item>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="renewalDate" label="续期日期" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
          <Col span={12}><Form.Item name="cycle" label="周期"><Select options={(["monthly", "yearly", "custom"] as Asset["cycle"][]).map((value) => ({ value, label: cycleName[value] }))} /></Form.Item></Col>
        </Row>
        <Button title="仅域名火种可用：占验 WHOIS 并把到期灵纹写入续期日" icon={<GlobalOutlined />} onClick={fillWhois}>占验 WHOIS 并刻续期日</Button>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="price" label={t("price")}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
          <Col span={12}><Form.Item name="currency" label="货币"><Select showSearch options={currencyOptions} /></Form.Item></Col>
        </Row>
        <Form.Item name="url" label="管理地址"><Input placeholder="https://console.example.com / https://admin.example.com" /></Form.Item>
        <Form.Item name="tags" label="标签"><Select mode="tags" tokenSeparators={[","]} /></Form.Item>
        <Form.Item name="notes" label="备注"><TextArea rows={3} /></Form.Item>
      </Form>
    </Drawer>
  );
}

function AssetsModule({
  globalSearch,
  goAi,
  quickCreateNonce,
}: {
  globalSearch?: string;
  goAi?: () => void;
  quickCreateNonce?: number;
}) {
  const { t } = useTranslation();
  const { filtered, keyword, setKeyword, type, setType } = useFilteredAssets(globalSearch);
  const deleteAsset = useYiHuoStore((state) => state.deleteAsset);
  const importAssets = useYiHuoStore((state) => state.importAssets);
  const preferredCurrency = useYiHuoStore((state) => state.settings.currency);
  const [view, setView] = useState<ViewMode>("table");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Asset>();
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(5);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [api, contextHolder] = message.useMessage();

  useEffect(() => {
    if (quickCreateNonce) {
      setEditing(undefined);
      setDrawerOpen(true);
    }
  }, [quickCreateNonce]);

  useEffect(() => {
    setTablePage(1);
  }, [keyword, type, tablePageSize]);

  const runAssetImport = () => {
    const parsed = parseImportedAssets(importText);
    if (!parsed.length) {
      api.warning("请先投放清单文本，再启纳火阵");
      return;
    }
    importAssets(parsed);
    setImportOpen(false);
    setImportText("");
    api.success(`已纳入 ${parsed.length} 枚资产火种`);
  };

  const columns: ColumnsType<Asset> = [
    {
      title: "名称",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (value: string, record) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{value}</Text>
          <Space size={4}>{record.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</Space>
        </Space>
      ),
    },
    { title: "类型", dataIndex: "type", filters: assetTypes.map((item) => ({ text: assetTypeName[item], value: item })), onFilter: (value, record) => record.type === value, render: (value: AssetType) => <Tag color={typeTone[value]}>{assetTypeName[value]}</Tag> },
    { title: t("provider"), dataIndex: "provider", sorter: (a, b) => a.provider.localeCompare(b.provider) },
    { title: "续期日", dataIndex: "renewalDate", sorter: (a, b) => dayjs(a.renewalDate).valueOf() - dayjs(b.renewalDate).valueOf(), render: (value: string) => <Space><CalendarOutlined />{value}<Tag color="orange">{dayUnit(value)}</Tag></Space> },
    { title: t("price"), render: (_, record) => formatPreferredAmount(record.price, record.currency, preferredCurrency) },
    { title: "管理地址", dataIndex: "url", render: (value: string) => value ? <a className="asset-manage-link" href={value} target="_blank" rel="noreferrer">进入后台</a> : <Text className="muted">未填</Text> },
    {
      title: t("action"),
      render: (_, record) => (
        <Space>
          <Button title="编辑这条资产" size="small" icon={<EditOutlined />} onClick={() => { setEditing(record); setDrawerOpen(true); }} />
          <Popconfirm title="确认删除该资产？" onConfirm={() => deleteAsset(record.id)}>
            <Button title="删除这条资产" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="module-stack">
      {contextHolder}
      <Flex className="module-head" justify="space-between" gap={16} wrap="wrap">
        <div><Title level={2}>{t("assets")}</Title><Text className="muted">主流平台先入阁，冷门火种亦可自铸；支持搜寻、筛选、排序、分页与批量圈选。</Text></div>
        <Space wrap>
          <Button title="进入 AI 炼化炉，将文本或表格炼成资产火种" icon={<RobotOutlined />} onClick={goAi}>AI 炼化</Button>
          <Button title="投放表格文本，批量纳火入阁" icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>{t("import")}</Button>
          <Button title="手动收录一枚火种；域名类型会自动尝试 WHOIS 占验" type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setDrawerOpen(true); }}>{t("addAsset")}</Button>
        </Space>
      </Flex>
      <Card className="yhg-card">
        <Flex justify="space-between" gap={12} wrap="wrap" className="toolbar-row">
          <Input className="search-input" prefix={<SearchOutlined />} placeholder={t("search")} value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Space wrap>
            <Select value={type} onChange={setType} options={[{ value: "all", label: t("all") }, ...assetTypes.map((value) => ({ value, label: assetTypeName[value] }))]} />
            <Radio.Group value={view} onChange={(event) => setView(event.target.value)}>
              <Radio.Button value="table">{t("table")}</Radio.Button>
              <Radio.Button value="card">{t("card")}</Radio.Button>
            </Radio.Group>
            <Tooltip title="批量操作占位：导出、标记、删除">
              <Button title="对已勾选资产执行批量操作" disabled={!selectedIds.length}>批量操作 {selectedIds.length || ""}</Button>
            </Tooltip>
          </Space>
        </Flex>
        {view === "table" ? (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filtered}
            pagination={{
              current: tablePage,
              pageSize: tablePageSize,
              total: filtered.length,
              showSizeChanger: true,
              pageSizeOptions: ["5", "10", "20", "50"],
              showTotal: (total) => `共 ${total} 枚火种`,
              onChange: (page, size) => {
                setTablePage(page);
                setTablePageSize(size);
              },
              onShowSizeChange: (_page, size) => {
                setTablePage(1);
                setTablePageSize(size);
              },
            }}
            onChange={(pagination) => {
              setTablePage(pagination.current ?? 1);
              setTablePageSize(pagination.pageSize ?? tablePageSize);
            }}
            rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys), preserveSelectedRowKeys: true }}
          />
        ) : (
          <Row gutter={[16, 16]}>
            {filtered.map((asset) => (
              <Col xs={24} md={12} xl={8} key={asset.id}>
                <Card className="asset-card" actions={[<Tooltip title="编辑资产" key="edit"><EditOutlined onClick={() => { setEditing(asset); setDrawerOpen(true); }} /></Tooltip>, <Tooltip title="删除资产" key="delete"><DeleteOutlined onClick={() => deleteAsset(asset.id)} /></Tooltip>]}>
                  <Flex justify="space-between" align="start">
                    <Title level={4}>{asset.name}</Title>
                    {statusLabel(asset.status, t)}
                  </Flex>
                  <Space wrap><Tag color={typeTone[asset.type]}>{assetTypeName[asset.type]}</Tag><Tag>{asset.provider}</Tag></Space>
                  <Divider />
                  <Text className="muted">续期：{asset.renewalDate} · {dayUnit(asset.renewalDate)}</Text>
                  <br />
                  <Text>{formatPreferredAmount(asset.price, asset.currency, preferredCurrency)} / {cycleName[asset.cycle]}</Text>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>
      <AssetDrawer open={drawerOpen} editing={editing} onClose={() => setDrawerOpen(false)} />
      <Modal open={importOpen} title="批量纳火入阁" onCancel={() => setImportOpen(false)} onOk={runAssetImport} okText="纳入">
        <Paragraph className="muted">每行一枚火种：名称,类型,服务商,续期日期,价格。类型可填：域名、云主机、云服务、智能订阅、会员订阅、自定义。</Paragraph>
        <TextArea rows={8} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="示例：异火阁主域名,域名,火网注册局,2026-12-31,12" />
      </Modal>
    </div>
  );
}


function ChannelDrawer({ open, editing, onClose }: { open: boolean; editing?: NotificationChannel; onClose: () => void }) {
  const [form] = Form.useForm<NotificationChannel>();
  const addChannel = useYiHuoStore((state) => state.addChannel);
  const updateChannel = useYiHuoStore((state) => state.updateChannel);
  const [api, contextHolder] = message.useMessage();
  const [testing, setTesting] = useState(false);
  const watchedType = (Form.useWatch("type", form) ?? editing?.type ?? "Webhook") as NotifyType;
  const preset = notifyPresets[watchedType];

  useEffect(() => {
    if (!open) return;
    const type = editing?.type ?? "Webhook";
    form.setFieldsValue({
      type,
      enabled: true,
      target: "",
      name: channelTypeName[type],
      secretMasked: "",
      config: {},
      ...editing,
      template: editing?.template ?? defaultNotifyTemplate(type),
    });
  }, [editing, form, open]);

  const handleTypeChange = (type: NotifyType) => {
    form.setFieldsValue({
      type,
      target: "",
      secretMasked: "",
      config: {},
      name: channelTypeName[type],
      template: defaultNotifyTemplate(type),
    });
  };

  const save = async () => {
    const values = await form.validateFields();
    if (editing) updateChannel({ ...editing, ...values });
    else addChannel(values);
    onClose();
  };

  const testTemplate = async () => {
    const values = await form.validateFields();
    const type = values.type ?? "Webhook";
    const template = values.template || defaultNotifyTemplate(type);
    const channel = {
      ...values,
      id: editing?.id ?? values.id ?? "draft",
      enabled: values.enabled ?? true,
      name: values.name || channelTypeName[type],
      template,
    };
    setTesting(true);
    try {
      const adminKey = window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: JSON.stringify({ channel }),
      });
      const result = await response.json().catch(() => ({})) as { deliveredAt?: string; error?: string; messageId?: string };
      if (!response.ok) throw new Error(result.error || `通道返回 ${response.status}`);
      Modal.success({
        className: "yhg-themed-modal",
        rootClassName: "yhg-themed-modal-root",
        title: "空间通道试炼",
        width: 640,
        okText: "知道了",
        content: (
          <div className="notify-test-modal">
            <div className="notify-test-head">
              <FireOutlined />
              <span>{channelTypeName[type]} · 已送达</span>
            </div>
            <pre>{template}</pre>
            <Text className="muted">远端传讯阵法已确认收取此试炼。{result.messageId ? ` 回执：${result.messageId}` : ""}{result.deliveredAt ? ` 时间：${dayjs(result.deliveredAt).format("YYYY-MM-DD HH:mm:ss")}` : ""}</Text>
          </div>
        ),
      });
      api.success(`${channelTypeName[type]} 空间通道试炼已送达`);
    } catch (error) {
      api.error(error instanceof Error ? error.message : "空间通道试炼失败");
    } finally {
      setTesting(false);
    }
  };

  const renderField = (field: NotifyFieldPreset) => {
    const rules = field.required ? [{ required: true, message: `请填写${field.label}` }] : undefined;
    const control = field.options ? (
      <Select options={field.options} />
    ) : field.multiline ? (
      <TextArea rows={3} placeholder={field.placeholder} />
    ) : field.secret ? (
      <Input.Password placeholder={field.placeholder} autoComplete="new-password" />
    ) : (
      <Input placeholder={field.placeholder} />
    );
    return (
      <Form.Item key={field.name} name={fieldName(field.name)} label={field.label} rules={rules} extra={field.help}>
        {control}
      </Form.Item>
    );
  };

  return (
    <Drawer
      size="large"
      open={open}
      onClose={onClose}
      title={editing ? "编辑通知功法" : "新增通知功法"}
      extra={(
        <Space>
          <Button title="向真实远端发送空间通道试炼，成功后才显示回执" loading={testing} onClick={testTemplate}>测试通道</Button>
          <Button title="封存当前传讯阵法配置" type="primary" onClick={save}>保存</Button>
        </Space>
      )}
    >
      {contextHolder}
      <Form form={form} layout="vertical" className="channel-form">
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder={channelTypeName[watchedType]} /></Form.Item>
        <Form.Item name="type" label="类型">
          <Select showSearch onChange={handleTypeChange} options={notifyTypes.map((value) => ({ value, label: channelTypeName[value] }))} />
        </Form.Item>
        <Card className="notify-config-card" title={`${channelTypeName[watchedType]} 配置`}>
          <Paragraph className="muted">{preset.summary}</Paragraph>
          <Row gutter={16}>
            {preset.fields.map((field) => (
              <Col xs={24} md={field.multiline ? 24 : 12} key={field.name}>
                {renderField(field)}
              </Col>
            ))}
          </Row>
        </Card>
        <Card className="notify-template-card" title="空间通道试炼">
          <Paragraph className="muted">所有渠道共用此试炼辞令，仅用于验证通道是否稳定。</Paragraph>
          <Form.Item name="template" label="试炼辞令" rules={[{ required: true, message: "请填写试炼辞令" }]}>
            <TextArea rows={8} />
          </Form.Item>
        </Card>
        <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Drawer>
  );
}

function NotificationsModule() {
  const { t } = useTranslation();
  const channels = useYiHuoStore((state) => state.channels);
  const deleteChannel = useYiHuoStore((state) => state.deleteChannel);
  const testChannel = useYiHuoStore((state) => state.testChannel);
  const toggleChannel = useYiHuoStore((state) => state.toggleChannel);
  const [api, contextHolder] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationChannel>();
  const [testingId, setTestingId] = useState<string>();

  const runSavedTest = async (record: NotificationChannel) => {
    setTestingId(record.id);
    try {
      const adminKey = window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: JSON.stringify({ channel: record }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || `通道返回 ${response.status}`);
      testChannel(record.id);
      api.success(`${record.name || channelTypeName[record.type]} 空间通道试炼已送达`);
    } catch (error) {
      api.error(error instanceof Error ? error.message : "空间通道试炼失败");
    } finally {
      setTestingId(undefined);
    }
  };

  const columns: ColumnsType<NotificationChannel> = [
    { title: "名称", dataIndex: "name", render: (value: string) => <Text strong>{value}</Text> },
    { title: "类型", dataIndex: "type", render: (value: NotifyType) => <Tag color="gold">{channelTypeName[value]}</Tag> },
    { title: "目标", dataIndex: "target" },
    {
      title: "状态",
      dataIndex: "enabled",
      render: (value: boolean, record) => (
        <Switch
          checked={value}
          checkedChildren={t("enabled")}
          unCheckedChildren={t("disabled")}
          onChange={(checked) => toggleChannel(record.id, checked)}
        />
      ),
    },
    { title: "上次测试", dataIndex: "lastTest" },
    {
      title: t("action"),
      render: (_, record) => (
        <Space>
          <Button title="向真实远端发送空间通道试炼" size="small" loading={testingId === record.id} onClick={() => runSavedTest(record)}>{t("test")}</Button>
          <Button title="编辑该通知功法" size="small" icon={<EditOutlined />} onClick={() => { setEditing(record); setOpen(true); }} />
          <Popconfirm title="删除该通知功法？" onConfirm={() => deleteChannel(record.id)}><Button title="删除该通知渠道" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="module-stack">
      {contextHolder}
      <Flex className="module-head" justify="space-between" wrap="wrap">
        <div><Title level={2}>{t("notifications")}</Title><Text className="muted">Email、Telegram、Discord、Slack、Webhook、钉钉、企业微信、飞书、Bark、Server酱、PushPlus、ntfy、Gotify、Pushover、Teams、Google Chat、Matrix 等主流渠道。</Text></div>
        <Button title="新铸 Email、Telegram、Discord、Webhook、钉钉、企业微信、飞书等传讯阵法" type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setOpen(true); }}>新增渠道</Button>
      </Flex>
      <Card className="yhg-card"><Table rowKey="id" dataSource={channels} columns={columns} pagination={false} /></Card>
      <ChannelDrawer open={open} editing={editing} onClose={() => setOpen(false)} />
    </div>
  );
}


function AiModule({ onForgeDone }: { onForgeDone?: () => void }) {
  const { t } = useTranslation();
  const aiConfig = useYiHuoStore((state) => state.aiConfig);
  const updateAiConfig = useYiHuoStore((state) => state.updateAiConfig);
  const addModel = useYiHuoStore((state) => state.addModel);
  const removeModel = useYiHuoStore((state) => state.removeModel);
  const [text, setText] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [forging, setForging] = useState(false);
  const [api, contextHolder] = message.useMessage();

  useEffect(() => {
    if (aiConfig.provider === "\u5f00\u653e\u63a5\u53e3\u517c\u5bb9") {
      updateAiConfig({ provider: "OpenAI Compatible" });
    }
  }, [aiConfig.provider, updateAiConfig]);

  const readForgeFile = async (file: File) => {
    try {
      const content = (await file.text()).trim();
      if (!content) {
        api.warning("此卷为空，未感知到可炼化内容");
        return false;
      }
      setText((current) => current.trim() ? `${current.trim()}\n${content}` : content);
      api.success(`已读取 ${file.name}，可开始炼化资产`);
    } catch {
      api.error("残卷读取失败，请换成 CSV 或纯文本清单");
    }
    return false;
  };

  const runImport = async () => {
    if (!text.trim()) {
      api.warning("\u8bf7\u5148\u6295\u653e\u5f85\u70bc\u5316\u7684\u8d44\u4ea7\u6e05\u5355");
      return;
    }
    setForging(true);
    try {
      const adminKey = window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
      const response = await fetch("/api/ai/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json().catch(() => ({}))) as { assets?: Asset[]; count?: number; source?: "ai" | "fallback"; warning?: string; error?: string; model?: string };
      if (!response.ok) throw new Error(payload.error || `AI \u70bc\u5316\u5931\u8d25 ${response.status}`);
      const assets = payload.assets ?? [];
      if (!assets.length) throw new Error("\u672a\u70bc\u6210\u53ef\u5165\u5e93\u7684\u8d44\u4ea7");
      useYiHuoStore.setState((state) => ({ assets: [...assets, ...state.assets] }));
      setText("");
      onForgeDone?.();
      Modal.success({
        className: "yhg-themed-modal",
        rootClassName: "yhg-themed-modal-root",
        title: "\u70bc\u5316\u6210\u529f\uff0c\u706b\u79cd\u5df2\u5165\u5e93",
        okText: "\u8fdb\u5165\u5f02\u706b\u5e93",
        onOk: () => onForgeDone?.(),
        content: (
          <div className="notify-test-modal">
            <div className="notify-test-head"><FireOutlined /><span>{payload.source === "ai" ? "AI \u4e39\u7089\u5df2\u6210" : "\u672c\u5730\u7075\u8bc6\u515c\u5e95\u5df2\u6210"}</span></div>
            <pre>{`\u5df2\u70bc\u6210 ${assets.length} \u679a\u8d44\u4ea7\u706b\u79cd\n\u5df2\u5199\u5165\u5f53\u524d\u5b58\u50a8\u5e93\n${payload.model ? `\u6a21\u578b\uff1a${payload.model}\n` : ""}${payload.warning ? `\u63d0\u793a\uff1a${payload.warning}` : "\u5f02\u706b\u5e93\u5df2\u5f00\uff0c\u53ef\u7acb\u5373\u6821\u9605\u3002"}`}</pre>
          </div>
        ),
      });
      api.success(`\u70bc\u5316\u6210\u529f\uff1a${assets.length} \u679a\u706b\u79cd\u5df2\u5165\u5f02\u706b\u5e93`);
    } catch (error) {
      api.error(error instanceof Error ? error.message : "AI \u70bc\u5316\u5931\u8d25");
    } finally {
      setForging(false);
    }
  };

  const fetchModels = async () => {
    try {
      const adminKey = window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
      const response = await fetch("/api/ai/models/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: JSON.stringify({ baseUrl: aiConfig.baseUrl, apiKey: aiConfig.apiKey }),
      });
      if (response.status === 401) {
        api.error("管理阁令不符，请先在设置中封存管理密钥");
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { models?: string[]; endpoint?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || `远端模型接口返回 ${response.status}`);
      const models = Array.from(new Set((payload.models ?? []).filter(Boolean)));
      if (!models.length) throw new Error("远端未返回可用模型");
      updateAiConfig({
        models,
        defaultModel: models.includes(aiConfig.defaultModel) ? aiConfig.defaultModel : models[0],
      });
      api.success(`已自远端召回 ${models.length} 个模型${payload.endpoint ? `，通道：${payload.endpoint}` : ""}`);
    } catch (error) {
      api.error(error instanceof Error ? error.message : "模型列表召回失败");
    }
  };

  return (
    <div className="module-stack">
      {contextHolder}
      <Flex className="module-head" justify="space-between" wrap="wrap">
        <div><Title level={2}>AI 炼化</Title><Text className="muted">投放文本、表格或知识库残卷，交由模型炼化为可续期火种。</Text></div>
      </Flex>
      <Row className="ai-layout" gutter={[28, 28]}>
        <Col xs={24} xl={14}>
          <Card className="yhg-card" title="AI 炼化炉">
            <Upload.Dragger beforeUpload={readForgeFile} maxCount={1} accept=".csv,.txt,.tsv,text/csv,text/plain">
              <p className="ant-upload-drag-icon"><ImportOutlined /></p>
              <p>将表格、清单或知识库残卷投入此炉，交由所选模型炼化</p>
            </Upload.Dragger>
            <TextArea className="import-textarea" rows={10} value={text} onChange={(event) => setText(event.target.value)} />
            <div className="ai-forge-actions">
              <Button className="ai-forge-button" title="将上方文本炼成资产火种并收入阁中" type="primary" icon={<RobotOutlined />} loading={forging} onClick={runImport}>开始炼化资产</Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card className="yhg-card" title="炼化配置">
            <Space className="ai-config-stack" orientation="vertical" style={{ width: "100%" }}>
              <label className="field-label">模型提供方</label>
              <Select
                showSearch
                className="ai-provider-select"
                popupClassName="ai-provider-dropdown"
                popupMatchSelectWidth={560}
                style={{ width: "100%" }}
                value={aiConfig.provider}
                optionFilterProp="label"
                onChange={(value) => {
                  const preset = aiProviderOptions.find((item) => item.value === value);
                  updateAiConfig({ provider: value, ...(preset?.baseUrl ? { baseUrl: preset.baseUrl } : {}) });
                }}
                options={aiProviderOptions.map(({ value, label }) => ({ value, label }))}
              />
              <label className="field-label">接口密钥</label>
              <Input.Password value={aiConfig.apiKey} autoComplete="new-password" onChange={(event) => updateAiConfig({ apiKey: event.target.value })} placeholder="sk-..." />
              <label className="field-label">接口地址</label>
              <Input value={aiConfig.baseUrl} onChange={(event) => updateAiConfig({ baseUrl: event.target.value })} />
              <label className="field-label">默认模型</label>
              <Select style={{ width: "100%" }} value={aiConfig.defaultModel} onChange={(value) => updateAiConfig({ defaultModel: value })} options={aiConfig.models.map((model) => ({ value: model, label: model }))} />
            </Space>
          </Card>
          <Card className="yhg-card ai-model-card" title={t("modelManage")}>
            <Space.Compact style={{ width: "100%" }}>
              <Input value={modelInput} placeholder="输入模型名后回车/加入" onPressEnter={() => { if (modelInput.trim()) { addModel(modelInput.trim()); setModelInput(""); } }} onChange={(event) => setModelInput(event.target.value)} />
              <Button title="把输入框中的模型名加入列表" onClick={() => { if (modelInput.trim()) { addModel(modelInput.trim()); setModelInput(""); } }}>加入</Button>
              <Button title="从后端接口同步可用模型列表" onClick={fetchModels}>获取列表</Button>
            </Space.Compact>
            <div className="model-list">
              {aiConfig.models.map((model) => (
                <Tag key={model} closable onClose={() => removeModel(model)} color={model === aiConfig.defaultModel ? "orange" : "purple"}>{model}</Tag>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function SettingsModule() {
  const settings = useYiHuoStore((state) => state.settings);
  const assets = useYiHuoStore((state) => state.assets);
  const domains = useYiHuoStore((state) => state.domains);
  const channels = useYiHuoStore((state) => state.channels);
  const aiConfig = useYiHuoStore((state) => state.aiConfig);
  const updateSettings = useYiHuoStore((state) => state.updateSettings);
  const [backupForm] = Form.useForm<BackupTarget>();
  const [backupOpen, setBackupOpen] = useState(false);
  const [editingBackupId, setEditingBackupId] = useState<string>();
  const [adminKey, setAdminKey] = useState(() => window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "");
  const [api, contextHolder] = message.useMessage();
  const backupTargets = settings.backupTargets ?? [];
  const visibleModuleOrder = settings.moduleOrder.filter((key) => moduleKeys.includes(key));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ settings: { ...settings, backupTargets }, assets, domains, channels, aiConfig }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `yihuoge-export-${dayjs().format("YYYYMMDD-HHmmss")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    api.success("阁令、火种、AI 与备份法阵已一并封存");
  };

  const importJson = async (file: File) => {
    try {
      const imported = JSON.parse(await file.text()) as { settings?: Partial<typeof settings> };
      if (imported.settings) updateSettings(imported.settings);
      api.success("配置卷轴已读取，备份法阵已并入阁令");
    } catch {
      api.error("此卷轴灵纹不合，无法识别为有效数据");
    }
    return false;
  };

  const openBackupEditor = (target?: BackupTarget) => {
    setEditingBackupId(target?.id);
    backupForm.setFieldsValue(target ?? { type: "WebDAV", enabled: true, name: "", target: "", notes: "" });
    setBackupOpen(true);
  };

  const saveBackupTarget = async () => {
    const values = await backupForm.validateFields();
    const nextTarget: BackupTarget = { ...values, id: editingBackupId ?? `backup-${Date.now()}` };
    updateSettings({
      backupTargets: editingBackupId
        ? backupTargets.map((item) => (item.id === editingBackupId ? nextTarget : item))
        : [nextTarget, ...backupTargets],
    });
    setBackupOpen(false);
    api.success("备份法阵已刻录");
  };

  const removeBackupTarget = (id: string) => {
    updateSettings({ backupTargets: backupTargets.filter((item) => item.id !== id) });
    api.success("备份法阵已抹除");
  };

  const saveAdminKey = () => {
    window.localStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
    api.success("管理阁令已封存于当前浏览器");
  };

  return (
    <div className="module-stack">
      {contextHolder}
      <Flex className="module-head" justify="space-between" wrap="wrap">
        <div><Title level={2}>设置</Title><Text className="muted">语言、时区、偏好币种、提醒策略、传讯阵法、模块顺序、主题、导入导出、AI 全局配置与备份法阵。</Text></div>
      </Flex>
      <Row gutter={[18, 18]}>
        <Col xs={24} xl={12}>
          <Card className="yhg-card" title="全局偏好">
            <Form layout="vertical">
              <Form.Item label="语言"><Select value={settings.language} onChange={(language: Language) => updateSettings({ language })} options={[{ value: "zh", label: "中文" }, { value: "en", label: "英文" }]} /></Form.Item>
              <Form.Item label="时区"><Select showSearch value={settings.timezone} onChange={(timezone) => updateSettings({ timezone })} options={timezoneOptions} /></Form.Item>
              <Form.Item label="偏好币种"><Select value={settings.currency} onChange={(currency) => updateSettings({ currency })} options={currencyOptions} /></Form.Item>
              <Form.Item label="默认提醒天数"><Select mode="tags" value={settings.reminderDays.map(String)} onChange={(values) => updateSettings({ reminderDays: values.map(Number).filter((value) => !Number.isNaN(value)) })} /></Form.Item>
              <Form.Item label="默认通知功法"><Select value={settings.defaultChannel} onChange={(defaultChannel) => updateSettings({ defaultChannel })} options={channels.map((channel) => ({ value: channel.id, label: channel.name }))} /></Form.Item>
              <Form.Item label="模块顺序"><Select mode="multiple" value={visibleModuleOrder} onChange={(moduleOrder) => updateSettings({ moduleOrder })} options={moduleKeys.map((key) => ({ value: key, label: moduleName[key] ?? key }))} /></Form.Item>
              <Form.Item label="外观主题"><Select value={settings.theme} onChange={(theme) => updateSettings({ theme })} options={[{ value: "dark-fire", label: "玄墨异火" }, { value: "abyss-purple", label: "幽冥紫炎" }, { value: "ink-gold", label: "墨金阁令" }]} /></Form.Item>
              <Form.Item label="管理密钥">
                <Space.Compact style={{ width: "100%" }}>
                  <Input.Password value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="输入 .env.local / Vercel 中的 YIHUOGE_ADMIN_KEY" />
                  <Button title="把管理密钥保存到当前浏览器，用于调用受保护接口" onClick={saveAdminKey}>保存</Button>
                </Space.Compact>
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            className="yhg-card backup-card"
            title="备份法阵"
            extra={<Button title="新铸 WebDAV、S3 或 Git 仓库 JSON 备份法阵" icon={<PlusOutlined />} onClick={() => openBackupEditor()}>新增法阵</Button>}
          >
            <div className="backup-list">
              {backupTargets.map((target) => (
                <div className="backup-row" key={target.id}>
                  <div>
                    <Space wrap>
                      <Tag color={target.enabled ? "cyan" : "default"}>{target.enabled ? "启用" : "停用"}</Tag>
                      <Tag color="purple">{backupTypeName[target.type]}</Tag>
                    </Space>
                    <Title level={5}>{target.name}</Title>
                    <Text className="muted">{target.target}</Text>
                    {target.notes && <Paragraph className="muted backup-note">{target.notes}</Paragraph>}
                  </div>
                  <Space wrap>
                    <Switch checked={target.enabled} checkedChildren="启用" unCheckedChildren="停用" onChange={(enabled) => updateSettings({ backupTargets: backupTargets.map((item) => item.id === target.id ? { ...item, enabled } : item) })} />
                    <Button title="编辑该备份方式" icon={<EditOutlined />} onClick={() => openBackupEditor(target)}>编辑</Button>
                    <Popconfirm title="确认删除该备份方式？" onConfirm={() => removeBackupTarget(target.id)}>
                      <Button title="删除该备份方式" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                </div>
              ))}
              {!backupTargets.length && <Text className="muted">暂无备份法阵，请新铸 WebDAV、S3 或 Git 仓库 JSON。</Text>}
            </div>
            <Divider />
            <Space wrap>
              <Upload beforeUpload={importJson} showUploadList={false} accept="application/json">
                <Button title="从 JSON 卷轴导入阁令，包含备份法阵" icon={<ImportOutlined />}>导入配置</Button>
              </Upload>
              <Button title="导出全部阁令、火种、传讯阵法、AI 配置，并包含备份法阵" onClick={exportJson}>导出数据</Button>
            </Space>
          </Card>
        </Col>
      </Row>
      <Modal open={backupOpen} title={editingBackupId ? "编辑备份法阵" : "新增备份法阵"} onCancel={() => setBackupOpen(false)} onOk={saveBackupTarget} okText="保存">
        <Form form={backupForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请填写备份名称" }]}><Input placeholder="例如：网盘镜像 / 对象存储仓 / Git JSON" /></Form.Item>
          <Form.Item name="type" label="类型"><Select options={(Object.keys(backupTypeName) as BackupTarget["type"][]).map((value) => ({ value, label: backupTypeName[value] }))} /></Form.Item>
          <Form.Item name="target" label="目标地址" rules={[{ required: true, message: "请填写备份目标地址" }]}><Input placeholder="https://dav.example.local、s3://bucket 或 git@example:repo.git:data/yihuoge.json" /></Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="notes" label="备注"><TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const settings = useYiHuoStore((state) => state.settings);
  const setLanguage = useYiHuoStore((state) => state.setLanguage);
  const [active, setActive] = useState("overview");
  const [globalSearch, setGlobalSearch] = useState("");
  const [quickCreateNonce, setQuickCreateNonce] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [api, contextHolder] = message.useMessage();
  const [accessState, setAccessState] = useState<AccessState>(() =>
    window.localStorage.getItem(ADMIN_KEY_STORAGE) ? "unlocked" : "locked",
  );
  const [savedAccessKey, setSavedAccessKey] = useState(() => window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "");

  const unlock = async (key: string) => {
    try {
      const ok = await verifyAdminKey(key);
      if (!ok) {
        window.localStorage.removeItem(ADMIN_KEY_STORAGE);
        setSavedAccessKey("");
        setAccessState("locked");
        return false;
      }
      window.localStorage.setItem(ADMIN_KEY_STORAGE, key);
      setSavedAccessKey(key);
      await hydrateFromServer(key);
      setAccessState("unlocked");
      return true;
    } catch {
      setAccessState("locked");
      return false;
    }
  };

  useEffect(() => {
    const stored = window.localStorage.getItem(ADMIN_KEY_STORAGE);
    if (!stored) return;
    setSavedAccessKey(stored);
    setAccessState("unlocked");
    void hydrateFromServer(stored);
  }, []);

  useEffect(() => {
    i18n.changeLanguage(settings.language);
    dayjs.locale(settings.language === "zh" ? "zh-cn" : "en");
    document.title = settings.language === "zh" ? "异火阁-天下万火，尽纳于此" : "YiHuoGe - All Flames Gathered Here";
  }, [i18n, settings.language]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!moduleKeys.includes(active)) setActive("overview");
  }, [active]);

  useEffect(() => {
    document.body.dataset.theme = settings.theme;
    return () => {
      delete document.body.dataset.theme;
    };
  }, [settings.theme]);

  const openQuickCreate = () => {
    setActive("assets");
    setQuickCreateNonce((value) => value + 1);
  };

  const menuItems = [
    { key: "overview", icon: <LayoutOutlined />, label: t("overview") },
    { key: "assets", icon: <AppstoreOutlined />, label: t("assets") },
    { key: "notifications", icon: <BellOutlined />, label: t("notifications") },
    { key: "ai", icon: <RobotOutlined />, label: t("ai") },
    { key: "settings", icon: <SettingOutlined />, label: t("settings") },
  ];

  const module = {
    overview: <OverviewModule setActive={setActive} onQuickAdd={openQuickCreate} />,
    assets: <AssetsModule globalSearch={globalSearch} goAi={() => setActive("ai")} quickCreateNonce={quickCreateNonce} />,
    notifications: <NotificationsModule />,
    ai: <AiModule onForgeDone={() => setActive("assets")} />,
    settings: <SettingsModule />,
  }[active];
  const palette = themePalettes[settings.theme] ?? themePalettes["dark-fire"];

  return (
    <ConfigProvider
      locale={settings.language === "zh" ? zhCN : enUS}
      theme={{
        token: {
          colorPrimary: palette.primary,
          colorBgBase: palette.bg,
          colorTextBase: palette.text,
          colorBorder: `${palette.primary}44`,
          borderRadius: 14,
          fontFamily: "YiHuoNotoSans, 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'PingFang SC', system-ui, sans-serif",
        },
        components: {
          Layout: { siderBg: "#0b0b0f", headerBg: "rgba(11,11,15,.88)", bodyBg: "#0b0b0f" },
          Card: { colorBgContainer: "rgba(24,26,32,.82)" },
          Table: { colorBgContainer: "rgba(18,18,23,.72)", headerBg: "rgba(245,158,11,.12)" },
        },
      }}
    >
      {contextHolder}
      {accessState !== "unlocked" ? (
        <AccessGate initialKey={savedAccessKey} checking={accessState === "checking"} onUnlock={unlock} />
      ) : (
        <Layout className={`app-shell theme-${settings.theme}`}>
        <Sider width={268} className="side-nav" breakpoint="lg" collapsedWidth={0}>
          <div className="brand-mark">
            <img className="brand-logo" src="/logo.png" alt="异火阁" />
            <div>
              <strong>异火阁</strong>
              <span>{t("brandMotto")}</span>
            </div>
          </div>
          <Menu mode="inline" selectedKeys={[active]} items={menuItems} onClick={({ key }) => setActive(key)} />
          <div className="side-footer">
            <ExclamationCircleOutlined /> 自托管异火阁
          </div>
        </Sider>
        <Layout>
          <Header className="topbar">
            <Input
              prefix={<SearchOutlined />}
              placeholder={t("search")}
              className="top-search"
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              onPressEnter={() => setActive("assets")}
              allowClear
            />
            <Space className="topbar-right" wrap>
              <Tag className="date-tag" icon={<CalendarOutlined />}>{topbarDate(now, settings.language, settings.timezone)}</Tag>
              <div className="language-switch" role="group" aria-label="Language switch">
                <button className={settings.language === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中文</button>
                <button className={settings.language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>英</button>
              </div>
              <span className="top-action-tip" data-tooltip={t("openAssetsTip")}>
                <Button className="top-action" icon={<ApiOutlined />} onClick={() => { setActive("assets"); api.info(settings.language === "zh" ? "资产火阁已开启" : "Asset forge opened"); }}>{t("topAssets")}</Button>
              </span>
              <span className="top-action-tip" data-tooltip={t("openNotificationsTip")}>
                <Button className="top-action" icon={<BellOutlined />} onClick={() => { setActive("notifications"); api.info(settings.language === "zh" ? "传讯阵法已开启" : "Notification array opened"); }}>{t("topNotifications")}</Button>
              </span>
              <span className="top-action-tip" data-tooltip={t("openSettingsTip")}>
                <Button className="top-action" icon={<SettingOutlined />} onClick={() => { setActive("settings"); api.info(settings.language === "zh" ? "阁令中枢已开启" : "Settings sanctum opened"); }}>{t("topSettings")}</Button>
              </span>
            </Space>
          </Header>
          <Content className="content-canvas">{module}</Content>
        </Layout>
        </Layout>
      )}
    </ConfigProvider>
  );
}
