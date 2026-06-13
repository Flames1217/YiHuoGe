import { nanoid } from "nanoid";
import { hasValidAdminKey, readState, writeState } from "../_state.js";

type AssetType = "domain" | "vps" | "hosting" | "ai" | "membership" | "custom";

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeDate(value?: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const normalized = raw.replace(/[./年]/g, "-").replace(/月/g, "-").replace(/日/g, "");
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function inferType(row: Record<string, any>, fallback?: string): AssetType {
  const raw = [fallback, row["类型"], row["类别"], row["资产类型"], row["域名"] ? "域名" : ""].filter(Boolean).join(" ");
  if (/域名|domain/i.test(raw)) return "domain";
  if (/vps|云主机|服务器|独立主机|ECS|CVM|EC2|droplet|IP地址/i.test(raw)) return "vps";
  if (/虚拟主机|共享主机|web\s*hosting|hosting|cPanel|Plesk|轻量应用/i.test(raw)) return "hosting";
  if (/AI|智能|模型|OpenAI|Claude|Gemini/i.test(raw)) return "ai";
  if (/会员|订阅|membership|SaaS/i.test(raw)) return "membership";
  return "custom";
}

function normalizeAsset(item: Record<string, any>, index: number) {
  const name = String(item.name ?? item["名称"] ?? item["域名"] ?? item["产品"] ?? item["实例名"] ?? item["管理后台"] ?? `炼化资产 ${index + 1}`).trim();
  const provider = String(item.provider ?? item["服务商"] ?? item["平台"] ?? item["注册商"] ?? item["地区"] ?? "自定义").trim();
  const url = String(item.url ?? item["管理地址"] ?? item["管理后台"] ?? item["后台"] ?? item["控制台"] ?? item["console"] ?? "").trim();
  const account = String(item.account ?? item["账号"] ?? item["账户"] ?? item["邮箱"] ?? item["IP地址"] ?? item["实例ID"] ?? "炼化导入").trim();
  const renewalDate = normalizeDate(item.renewalDate ?? item["续期日"] ?? item["续期日期"] ?? item["到期时间"] ?? item["到期日期"] ?? item["expires"] ?? item["expiration"]);
  const notes = [
    item.notes,
    item["备注"],
    item["状态"] ? `原状态：${item["状态"]}` : "",
    item["密码"] || item.password || item.token || item.secret ? "原表包含密码/密钥列，已避免展示明文。" : "",
  ].filter(Boolean).join("\n");
  return {
    id: nanoid(10),
    name: name || `炼化资产 ${index + 1}`,
    type: inferType(item, item.type),
    provider: provider || "自定义",
    account,
    renewalDate,
    price: Number(item.price ?? item["价格"] ?? item["费用"] ?? item["金额"] ?? item.cost ?? 0) || 0,
    currency: String(item.currency ?? item["货币"] ?? "CNY"),
    cycle: ["monthly", "yearly", "custom"].includes(item.cycle) ? item.cycle : "custom",
    status: "healthy",
    url,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag: string) => tag !== "AI炼化") : [],
    notes: notes || "由 AI 炼化生成，可继续编辑。",
  };
}

function parseLocal(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/^[\[{]/.test(trimmed)) {
    try {
      const payload = JSON.parse(trimmed);
      const items = Array.isArray(payload) ? payload : Array.isArray(payload.assets) ? payload.assets : [];
      return items.map((item: Record<string, any>, index: number) => normalizeAsset(item, index)).filter((asset) => asset.name);
    } catch {}
  }
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]);
  const hasHeader = header.some((cell) => ["名称", "域名", "管理后台", "到期时间", "到期日期", "平台", "账号", "服务商", "类型", "IP地址"].includes(cell));
  if (hasHeader) {
    return lines.slice(1).map((line, index) => {
      const cells = splitCsvLine(line);
      const row = Object.fromEntries(header.map((key, cellIndex) => [key, cells[cellIndex] ?? ""]));
      return normalizeAsset(row, index);
    }).filter((asset) => asset.name && !asset.name.startsWith("炼化资产"));
  }
  return lines.map((line, index) => {
    const [name, type, provider, renewalDate, price, url] = splitCsvLine(line);
    return normalizeAsset({ name, type, provider, renewalDate, price, url }, index);
  });
}

function extractJson(content: string) {
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(trimmed); } catch {}
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  const candidate = objectMatch?.[0] ?? arrayMatch?.[0];
  if (!candidate) throw new Error("AI 未返回 JSON");
  return JSON.parse(candidate);
}

function completionEndpointCandidates(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return [];
  const urls = new Set<string>();
  if (/\/chat\/completions$/i.test(base)) urls.add(base);
  else {
    urls.add(`${base}/chat/completions`);
    if (!/\/(?:v\d+(?:beta)?|openai\/v\d+(?:beta)?|compatible-mode\/v\d+)$/i.test(base)) {
      urls.add(`${base}/v1/chat/completions`);
    }
  }
  return [...urls];
}

async function aiForge(text: string, ai: Record<string, any>) {
  const baseUrl = String(ai.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey = String(ai.apiKey ?? "");
  const model = String(ai.defaultModel || ai.models?.[0] || "");
  if (!baseUrl || !apiKey || !model) throw new Error("AI 炼化配置不完整");

  const body = JSON.stringify({
    model,
    temperature: 0.05,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `你是“异火阁”的资产炼化器。把用户提供的 CSV、TSV、JSON、表格文本、域名/服务器/订阅导出数据映射成异火阁 Asset。
Asset 字段：name,type,provider,account,renewalDate,price,currency,cycle,url,tags,notes。
type 只能是 domain/vps/hosting/ai/membership/custom。域名=>domain；VPS/云主机/独立服务器/IP=>vps；虚拟主机/共享主机/cPanel/Plesk/轻量应用=>hosting；OpenAI/Claude/Gemini/API/模型=>ai；会员/订阅/SaaS=>membership；无法判断=>custom。
renewalDate 必须是 YYYY-MM-DD；管理后台/控制台/console/login/dashboard 写入 url；域名若有 DNS/托管商/解析商，写入 hostProvider/hostUrl；密码/token/secret 不要明文返回，只在 notes 说明已忽略敏感列；不要默认添加“AI炼化”标签。
只返回严格 JSON：{"assets":[...]}，不要 Markdown。`,
      },
      { role: "user", content: text.slice(0, 30000) },
    ],
  });

  let lastError = "";
  for (const endpoint of completionEndpointCandidates(baseUrl)) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 YiHuoGe/1.0",
        Authorization: /^Bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`,
      },
      body,
    });
    const raw = await response.text();
    if (!response.ok) {
      lastError = `${response.status} @ ${endpoint}: ${raw.slice(0, 180)}`;
      continue;
    }
    const data = raw ? JSON.parse(raw) : {};
    const content = data.choices?.[0]?.message?.content ?? data.output_text ?? data.output?.[0]?.content?.[0]?.text ?? "";
    const payload = extractJson(String(content));
    const items = Array.isArray(payload) ? payload : Array.isArray(payload.assets) ? payload.assets : [];
    const assets = items.map((item: Record<string, any>, index: number) => normalizeAsset(item, index)).filter((asset) => asset.name);
    if (assets.length) return { assets, model };
    lastError = "AI 未返回可入库资产";
  }
  throw new Error(`AI 炼化失败：${lastError || "远端通道无响应"}`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!hasValidAdminKey(req)) {
    res.status(401).json({ error: "invalid admin key" });
    return;
  }

  const text = String(req.body?.text ?? "").trim();
  if (!text) {
    res.status(400).json({ error: "请先投放待炼化的资产清单" });
    return;
  }

  const db = await readState();
  let source: "ai" | "fallback" = "ai";
  let warning = "";
  let assets: any[] = [];
  let model = String(db.ai?.defaultModel ?? "");
  try {
    const result = await aiForge(text, db.ai ?? {});
    assets = result.assets;
    model = result.model;
  } catch (error) {
    source = "fallback";
    warning = error instanceof Error ? error.message : "AI 炼化未成，已启用本地解析";
    assets = parseLocal(text);
  }

  if (!assets.length) {
    res.status(400).json({ error: warning || "未炼成可入库的资产" });
    return;
  }

  db.assets = [...assets, ...(Array.isArray(db.assets) ? db.assets : [])];
  await writeState(db);
  res.status(200).json({ assets, count: assets.length, source, warning, model });
}
