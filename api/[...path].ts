import cors from "cors";
import express from "express";
import type { Request } from "express";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { fetchProviderModels } from "./_aiModels.js";
import { normalizeStoredAsset, readState, writeState } from "./_state.js";
import { deleteRemoteBackup, listRemoteBackups, normalizeBackupTarget, readRemoteBackup, runBackupTarget, runDueBackups, testBackupTarget, type BackupTargetConfig } from "../server/backup.js";
import { getExchangeRates } from "../server/exchangeRates.js";
import { sendNotificationDispatch, sendNotificationTest, type NotificationDispatchPayload } from "../server/notify.js";
import { lookupDomainRdap } from "../server/rdap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function loadLocalEnv() {
  const envFile = path.join(rootDir, ".env.local");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const adminKey = process.env.YIHUOGE_ADMIN_KEY ?? "";

type AssetType = "domain" | "vps" | "hosting" | "cloud" | "ai" | "membership" | "custom";
type AssetStatus = "healthy" | "warning" | "critical" | "expired";
type AssetCycle = "daily" | "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly" | "biennial" | "triennial" | "decennial" | "lifetime" | "custom";

interface Asset {
  id: string;
  name: string;
  type: AssetType;
  provider: string;
  providerUrl?: string;
  hostProvider?: string;
  hostUrl?: string;
  account: string;
  renewalDate: string;
  price: number;
  currency: string;
  cycle: AssetCycle;
  customCycle?: { years?: number; months?: number; days?: number };
  status: AssetStatus;
  autoRenew: boolean;
  url?: string;
  tags: string[];
  notes?: string;
}

interface DomainRecord extends Asset {
  type: "domain";
  registrar: string;
  createdAt: string;
  expiresAt: string;
  dns: string[];
  whoisStatus: string[];
}

interface NotificationChannel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  target: string;
  lastTest?: string;
  secretMasked?: string;
  config?: Record<string, string>;
  template?: string;
}

interface BackupTarget extends BackupTargetConfig {}

interface Database {
  assets: Asset[];
  domains: DomainRecord[];
  channels: NotificationChannel[];
  ai: {
    provider: string;
    baseUrl: string;
    models: string[];
    defaultModel: string;
  };
  settings: Record<string, unknown> & { backupTargets?: BackupTarget[] };
}

async function readDb(): Promise<Database> {
  return await readState() as Database;
}

async function writeDb(db: Database) {
  await writeState(db);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "3mb" }));

function hasValidAdminKey(req: Request) {
  return !adminKey || req.header("x-admin-key") === adminKey || req.header("authorization") === `Bearer ${adminKey}`;
}

app.use((req, res, next) => {
  const protectedMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const protectedRead = req.path.startsWith("/api/bootstrap") || req.path.startsWith("/api/assets") || req.path.startsWith("/api/channels") || req.path.startsWith("/api/settings") || req.path.startsWith("/api/backups");
  const publicPath = req.path === "/api/health" || req.path === "/api/auth/verify";
  if (publicPath || !adminKey || (!protectedMethod && !protectedRead)) {
    next();
    return;
  }
  if (hasValidAdminKey(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "invalid admin key" });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "YiHuoGe", time: new Date().toISOString() });
});

app.post("/api/auth/verify", (req, res) => {
  if (hasValidAdminKey(req)) {
    res.json({ ok: true, protected: Boolean(adminKey) });
    return;
  }
  res.status(401).json({ ok: false, error: "invalid admin key" });
});

app.get("/api/bootstrap", async (_req, res) => {
  res.json(await readDb());
});

app.get("/api/exchange-rates", async (_req, res) => {
  res.json(await getExchangeRates());
});

app.get("/api/assets", async (_req, res) => {
  const db = await readDb();
  res.json(db.assets);
});

app.post("/api/assets", async (req, res) => {
  const db = await readDb();
  const asset = normalizeStoredAsset({ id: nanoid(10), status: "healthy", autoRenew: true, tags: [], ...req.body }) as Asset;
  db.assets.unshift(asset);
  await writeDb(db);
  res.status(201).json(asset);
});

app.put("/api/assets/:id", async (req, res) => {
  const db = await readDb();
  db.assets = db.assets.map((asset) => (asset.id === req.params.id ? normalizeStoredAsset({ ...asset, ...req.body, id: asset.id }) : asset));
  if (req.body?.type && req.body.type !== "domain") db.domains = db.domains.filter((domain) => domain.id !== req.params.id);
  await writeDb(db);
  res.json(db.assets.find((asset) => asset.id === req.params.id));
});

app.delete("/api/assets/:id", async (req, res) => {
  const db = await readDb();
  db.assets = db.assets.filter((asset) => asset.id !== req.params.id);
  db.domains = db.domains.filter((domain) => domain.id !== req.params.id);
  await writeDb(db);
  res.status(204).send();
});

app.get("/api/domains", async (_req, res) => {
  const db = await readDb();
  res.json(db.domains);
});

async function handleWhoisLookup(requested: unknown, res: express.Response) {
  const db = await readDb();
  const requestedDomain = String(requested ?? "").toLowerCase();
  const found = db.domains.find((domain) => domain.name.toLowerCase() === requestedDomain);
  const cachedRegistrar = found?.registrar?.trim().toLowerCase();
  if (found?.expiresAt && cachedRegistrar && !["自定义", "rdap registrar", "rdap lookup failed"].includes(cachedRegistrar)) {
    res.json(found);
    return;
  }
  try {
    res.json(await lookupDomainRdap(requestedDomain));
  } catch (error) {
    res.status(200).json({
      name: requestedDomain,
      registrar: "RDAP lookup failed",
      createdAt: "",
      expiresAt: "",
      dns: [],
      whoisStatus: ["rdap-lookup-failed"],
      error: error instanceof Error ? error.message : "RDAP lookup failed",
    });
  }
}

app.use("/api/whois", async (req, res, next) => {
  if (req.method !== "GET" || req.path !== "/") {
    next();
    return;
  }
  await handleWhoisLookup(req.query.domain, res);
});

app.get("/api/whois", async (req, res) => {
  await handleWhoisLookup(req.query.domain, res);
});

app.get("/api/whois/:domain", async (req, res) => {
  await handleWhoisLookup(req.params.domain, res);
});

app.get("/api/channels", async (_req, res) => {
  const db = await readDb();
  res.json(db.channels);
});

app.post("/api/channels", async (req, res) => {
  const db = await readDb();
  const channel = { id: nanoid(10), enabled: true, ...req.body } as NotificationChannel;
  db.channels.unshift(channel);
  await writeDb(db);
  res.status(201).json(channel);
});

app.put("/api/channels/:id", async (req, res) => {
  const db = await readDb();
  db.channels = db.channels.map((channel) => (channel.id === req.params.id ? { ...channel, ...req.body, id: channel.id } : channel));
  await writeDb(db);
  res.json(db.channels.find((channel) => channel.id === req.params.id));
});

app.delete("/api/channels/:id", async (req, res) => {
  const db = await readDb();
  db.channels = db.channels.filter((channel) => channel.id !== req.params.id);
  await writeDb(db);
  res.status(204).send();
});

app.post("/api/notifications/test", async (req, res) => {
  try {
    const channel = req.body.channel as NotificationChannel;
    const result = await sendNotificationTest(channel);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "通知试炼失败" });
  }
});

app.post("/api/notifications/dispatch", async (req, res) => {
  try {
    const payload = req.body as NotificationDispatchPayload | undefined;
    if (!payload?.channel?.type || !payload?.asset?.id) {
      res.status(400).json({ ok: false, error: "缺少通知渠道或资产信息" });
      return;
    }
    const result = await sendNotificationDispatch(payload);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "通知发送失败" });
  }
});

app.post("/api/channels/:id/test", async (req, res) => {
  const db = await readDb();
  const channel = db.channels.find((item) => item.id === req.params.id);
  if (!channel) {
    res.status(404).json({ ok: false, error: "channel not found" });
    return;
  }
  try {
    const result = await sendNotificationTest(channel);
    const lastTest = result.deliveredAt;
  db.channels = db.channels.map((channel) =>
      channel.id === req.params.id ? { ...channel, lastTest } : channel,
  );
  await writeDb(db);
    res.json({ ...result, id: req.params.id, lastTest });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "通知试炼失败" });
  }
});

app.get("/api/ai/models", async (_req, res) => {
  const db = await readDb();
  res.json(db.ai.models);
});


app.post("/api/ai/models/fetch", async (req, res) => {
  try {
    const result = await fetchProviderModels(String(req.body.baseUrl ?? ""), String(req.body.apiKey ?? ""));
    res.json({ models: result.models, source: "provider", endpoint: result.endpoint });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "模型列表召回失败" });
  }
});

app.put("/api/ai/config", async (req, res) => {
  const db = await readDb();
  db.ai = { ...db.ai, ...req.body };
  await writeDb(db);
  res.json(db.ai);
});


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
      } else quoted = !quoted;
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


function normalizeCycle(value: unknown): AssetCycle {
  const raw = String(value ?? "").trim().toLowerCase();
  const aliases: Record<string, AssetCycle> = {
    day: "daily",
    daily: "daily",
    "\u65e5\u4ed8": "daily",
    week: "weekly",
    weekly: "weekly",
    "\u5468\u4ed8": "weekly",
    month: "monthly",
    monthly: "monthly",
    "\u6708\u4ed8": "monthly",
    quarter: "quarterly",
    quarterly: "quarterly",
    "\u5b63\u4ed8": "quarterly",
    semiannual: "semiannual",
    halfyear: "semiannual",
    "\u534a\u5e74\u4ed8": "semiannual",
    year: "yearly",
    yearly: "yearly",
    annual: "yearly",
    "\u5e74\u4ed8": "yearly",
    biennial: "biennial",
    "\u4e24\u5e74\u4ed8": "biennial",
    triennial: "triennial",
    "\u4e09\u5e74\u4ed8": "triennial",
    decennial: "decennial",
    "\u5341\u5e74\u4ed8": "decennial",
    "10\u5e74\u4ed8": "decennial",
    lifetime: "lifetime",
    permanent: "lifetime",
    "\u7ec8\u8eab": "lifetime",
    "\u6c38\u4e45": "lifetime",
    "\u6c38\u4e45\u6709\u6548": "lifetime",
    custom: "custom",
    "\u81ea\u5b9a": "custom",
    "\u81ea\u5b9a\u4e49": "custom",
  };
  if (["daily", "weekly", "monthly", "quarterly", "semiannual", "yearly", "biennial", "triennial", "decennial", "lifetime", "custom"].includes(raw)) return raw as AssetCycle;
  return aliases[raw] ?? "custom";
}

function normalizeAssetDate(value?: string) {
  const raw = String(value ?? "").trim();
  if (/^(lifetime|permanent|\u6c38\u4e45|\u6c38\u4e45\u6709\u6548|\u7ec8\u8eab)$/i.test(raw)) return "";
  if (!raw) return new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const normalized = raw.replace(/[./\u5e74]/g, "-").replace(/\u6708/g, "-").replace(/\u65e5/g, "");
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function inferAssetType(row: Record<string, string>, fallback?: string): AssetType {
  const raw = [fallback, row["\u7c7b\u578b"], row["\u7c7b\u522b"], row["\u8d44\u4ea7\u7c7b\u578b"], row["\u57df\u540d"] ? "\u57df\u540d" : ""].filter(Boolean).join(" ");
  if (/\u57df\u540d|domain/i.test(raw)) return "domain";
  if (/vps|\u4e91\u4e3b\u673a|\u670d\u52a1\u5668|\u72ec\u7acb\u4e3b\u673a|ECS|CVM|EC2|droplet/i.test(raw)) return "vps";
  if (/\u865a\u62df\u4e3b\u673a|\u5171\u4eab\u4e3b\u673a|web\s*hosting|hosting|cPanel|Plesk|\u8f7b\u91cf\u5e94\u7528/i.test(raw)) return "hosting";
  if (/AI|\u667a\u80fd|\u6a21\u578b|OpenAI|Claude|Gemini/i.test(raw)) return "ai";
  if (/\u4f1a\u5458|\u8ba2\u9605|membership/i.test(raw)) return "membership";
  return "custom";
}

function normalizeImportedAsset(item: Record<string, any>, index: number): Asset {
  const name = String(item.name ?? item["\u540d\u79f0"] ?? item["\u57df\u540d"] ?? item["\u7ba1\u7406\u540e\u53f0"] ?? `\u70bc\u5316\u8d44\u4ea7 ${index + 1}`).trim();
  const provider = String(item.provider ?? item["\u670d\u52a1\u5546"] ?? item["\u5e73\u53f0"] ?? item["\u6ce8\u518c\u5546"] ?? item["\u5730\u533a"] ?? "\u81ea\u5b9a\u4e49").trim();
  const url = String(item.url ?? item["\u7ba1\u7406\u5730\u5740"] ?? item["\u7ba1\u7406\u540e\u53f0"] ?? item["\u540e\u53f0"] ?? item["\u63a7\u5236\u53f0"] ?? "").trim();
  const account = String(item.account ?? item["\u8d26\u53f7"] ?? item["\u8d26\u6237"] ?? item["IP\u5730\u5740"] ?? "\u70bc\u5316\u5bfc\u5165").trim();
  const rawRenewalDate = String(item.renewalDate ?? item["\u7eed\u671f\u65e5"] ?? item["\u7eed\u671f\u65e5\u671f"] ?? item["\u5230\u671f\u65f6\u95f4"] ?? item["\u5230\u671f\u65e5\u671f"] ?? "");
  const renewalDate = normalizeAssetDate(rawRenewalDate);
  const cycle = /^(lifetime|permanent|\u6c38\u4e45|\u6c38\u4e45\u6709\u6548|\u7ec8\u8eab)$/i.test(rawRenewalDate.trim())
    ? "lifetime"
    : normalizeCycle(item.cycle ?? item["\u5468\u671f"] ?? item["\u4ed8\u8d39\u5468\u671f"] ?? item["\u8ba1\u8d39\u5468\u671f"]);
  const notes = [item.notes, item["\u5907\u6ce8"], item["\u72b6\u6001"] ? `\u539f\u72b6\u6001\uff1a${item["\u72b6\u6001"]}` : "", item["\u5bc6\u7801"] ? "\u539f\u8868\u5305\u542b\u5bc6\u7801\u5217\uff0c\u5df2\u907f\u514d\u5c55\u793a\u660e\u6587\u3002" : ""].filter(Boolean).join("\n");
  return {
    id: nanoid(10),
    name: name || `\u70bc\u5316\u8d44\u4ea7 ${index + 1}`,
    type: inferAssetType(item, item.type),
    provider: provider || "\u81ea\u5b9a\u4e49",
    providerUrl: String(item.providerUrl ?? "").trim(),
    hostProvider: String(item.hostProvider ?? item["\u6258\u7ba1\u5546"] ?? item["DNS"] ?? item["DNS\u670d\u52a1\u5546"] ?? item["\u89e3\u6790\u5546"] ?? "").trim(),
    hostUrl: String(item.hostUrl ?? item["\u6258\u7ba1\u5730\u5740"] ?? item["DNS\u540e\u53f0"] ?? "").trim(),
    account,
    renewalDate,
    price: Number(item.price ?? item["\u4ef7\u683c"] ?? item["\u8d39\u7528"] ?? 0) || 0,
    currency: String(item.currency ?? item["\u8d27\u5e01"] ?? "CNY"),
    cycle,
    customCycle: cycle === "custom" && item.customCycle ? item.customCycle : undefined,
    status: "healthy",
    autoRenew: item.autoRenew ?? true,
    url,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag: string) => tag !== "AI\u70bc\u5316") : [],
    notes: notes || "\u7531 AI \u70bc\u5316\u751f\u6210\uff0c\u53ef\u7ee7\u7eed\u7f16\u8f91\u3002",
  };
}

function parseAssetsLocally(text: string): Asset[] {
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
    const [name, type, provider, renewalDate, price, url] = splitAssetCsvLine(line);
    return normalizeImportedAsset({ name, type, provider, renewalDate, price, url }, index);
  });
}

function extractJsonPayload(content: string) {
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(trimmed); } catch {}
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  const candidate = objectMatch?.[0] ?? arrayMatch?.[0];
  if (!candidate) throw new Error("AI \u672a\u8fd4\u56de JSON");
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

async function aiForgeAssets(text: string, ai: Database["ai"]): Promise<Asset[]> {
  const baseUrl = String(ai.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey = String((ai as any).apiKey ?? "");
  const model = ai.defaultModel || ai.models?.[0];
  if (!baseUrl || !apiKey || !model) throw new Error("AI forge config is incomplete");
  const body = JSON.stringify({
    model,
    temperature: 0.05,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `You are the built-in YiHuoGe asset forge agent. Convert the user's COMPLETE raw CSV/TSV/JSON/table text/export into normalized assets.
Project asset schema:
- name: asset name, domain, product, instance name, subscription name.
- type: only domain/vps/hosting/ai/membership/custom. Domains => domain; VPS/cloud servers/dedicated servers/IP instances => vps; virtual hosting/shared hosting/cPanel/Plesk/light app servers => hosting; OpenAI/Claude/Gemini/API/model subscription => ai; membership/SaaS/subscription => membership; uncertain => custom.
- provider: registrar, cloud vendor, SaaS provider, platform, or custom provider.
- providerUrl: provider console/login/dashboard URL when present.
- hostProvider/hostUrl: for domain DNS/hosting/nameserver provider and its console URL.
- account: login email/account/instance ID/IP if present; leave empty if a domain has no independent account.
- renewalDate: YYYY-MM-DD from expiry/expiration/next billing/renewal date; infer only when explicit enough.
- price/currency/cycle: price number, currency such as CNY/USD/HKD/JPY/EUR/TRY, cycle only daily/weekly/monthly/quarterly/semiannual/yearly/biennial/triennial/decennial/lifetime/custom. For custom cycle, include customCycle as {years,months,days}.
- url: management console URL if it is the main management address.
- tags: do not invent decorative tags; never add decorative AI tags automatically.
- notes: keep useful non-sensitive context; never return raw password/token/secret/API key.
Return strict JSON only: {"assets":[...]}. Do not use Markdown. Preserve as many usable rows as possible; do not split or summarize the raw file before reasoning over it.` },
      { role: "user", content: text },
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
    const payload = extractJsonPayload(content);
    const items = Array.isArray(payload) ? payload : Array.isArray(payload.assets) ? payload.assets : [];
    const assets = items.map((item: Record<string, any>, index: number) => normalizeImportedAsset(item, index)).filter((asset: Asset) => asset.name);
    if (assets.length) return assets;
    lastError = "AI \u672a\u8fd4\u56de\u53ef\u5165\u5e93\u7684\u8d44\u4ea7";
  }
  throw new Error(`AI \u70bc\u5316\u5931\u8d25\uff1a${lastError || "\u8fdc\u7aef\u901a\u9053\u65e0\u54cd\u5e94"}`);
}

async function aiTestModel(ai: Database["ai"], modelOverride?: string): Promise<{ endpoint: string; model: string; content: string }> {
  const baseUrl = String(ai.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey = String((ai as any).apiKey ?? "");
  const model = modelOverride || ai.defaultModel || ai.models?.[0];
  if (!baseUrl || !apiKey || !model) throw new Error("AI model test config is incomplete");
  const body = JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 80,
    messages: [
      { role: "system", content: "Reply with a short JSON object proving this model is reachable." },
      { role: "user", content: "Return {\"ok\":true}." },
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
    const content = String(data.choices?.[0]?.message?.content ?? data.output_text ?? data.output?.[0]?.content?.[0]?.text ?? "").trim();
    return { endpoint, model, content: content || "model reachable" };
  }
  throw new Error(`AI model test failed: ${lastError || "no endpoint responded"}`);
}

app.post("/api/ai/test", async (req, res) => {
  const db = await readDb();
  const model = String(req.body?.model ?? db.ai.defaultModel ?? "").trim();
  try {
    const result = await aiTestModel(db.ai, model);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "AI model test failed" });
  }
});
app.post("/api/ai/import", async (req, res) => {
  const text = String(req.body.text ?? "").trim();
  if (!text) {
    res.status(400).json({ error: "\u8bf7\u5148\u6295\u653e\u5f85\u70bc\u5316\u7684\u8d44\u4ea7\u6e05\u5355" });
    return;
  }
  const db = await readDb();
  let source: "ai" | "fallback" = "ai";
  let warning = "";
  let assets: Asset[] = [];
  try {
    assets = await aiForgeAssets(text, db.ai);
  } catch (error) {
    source = "fallback";
    warning = error instanceof Error ? error.message : "AI \u70bc\u5316\u672a\u6210\uff0c\u5df2\u542f\u7528\u672c\u5730\u89e3\u6790";
    assets = parseAssetsLocally(text);
  }
  if (!assets.length) {
    res.status(400).json({ error: warning || "\u672a\u70bc\u6210\u53ef\u5165\u5e93\u7684\u8d44\u4ea7" });
    return;
  }
  db.assets.unshift(...assets);
  await writeDb(db);
  res.json({ assets, count: assets.length, source, warning, model: db.ai.defaultModel });
});

app.get("/api/settings", async (_req, res) => {
  const db = await readDb();
  res.json(db.settings);
});

app.put("/api/settings", async (req, res) => {
  const db = await readDb();
  db.settings = { ...db.settings, ...req.body };
  await writeDb(db);
  res.json(db.settings);
});

function backupTargetsFrom(db: Database) {
  return Array.isArray(db.settings.backupTargets) ? db.settings.backupTargets.map(normalizeBackupTarget) : [];
}

async function updateBackupTargetStatus(id: string, patch: Partial<BackupTarget>) {
  const db = await readDb();
  const backupTargets = backupTargetsFrom(db).map((target) => (target.id === id ? normalizeBackupTarget({ ...target, ...patch }) : target));
  db.settings = { ...db.settings, backupTargets };
  await writeDb(db);
  return backupTargets.find((target) => target.id === id);
}

app.post("/api/backups/test", async (req, res) => {
  let target: BackupTarget | undefined;
  try {
    target = normalizeBackupTarget(req.body?.target ?? req.body);
    const result = await testBackupTarget(target);
    const patch = { lastTestAt: new Date().toISOString(), lastStatus: "success" as const, lastMessage: result.message };
    const nextTarget = target.id ? normalizeBackupTarget({ ...target, ...patch }) : undefined;
    if (target.id) void updateBackupTargetStatus(target.id, patch).catch(() => undefined);
    res.json({ ...result, target: nextTarget });
  } catch (error) {
    const message = error instanceof Error ? error.message : "备份连接测试失败";
    if (target?.id) void updateBackupTargetStatus(target.id, { lastTestAt: new Date().toISOString(), lastStatus: "failed", lastMessage: message }).catch(() => undefined);
    res.status(400).json({ ok: false, error: message });
  }
});

app.post("/api/backups/:id/run", async (req, res) => {
  const db = await readDb();
  const fallbackTarget = req.body?.target && req.body.target.id === req.params.id ? normalizeBackupTarget(req.body.target) : undefined;
  const target = backupTargetsFrom(db).find((item) => item.id === req.params.id) ?? fallbackTarget;
  if (!target) {
    res.status(404).json({ ok: false, error: "backup target not found" });
    return;
  }
  try {
    const result = await runBackupTarget(target, db);
    if (!backupTargetsFrom(db).some((item) => item.id === target.id)) {
      db.settings = { ...db.settings, backupTargets: [normalizeBackupTarget(target), ...backupTargetsFrom(db)] };
      await writeDb(db);
    }
    const saved = await updateBackupTargetStatus(target.id, { lastBackupAt: result.uploadedAt, nextBackupAt: result.nextBackupAt, lastStatus: "success", lastMessage: result.message });
    res.json({ ...result, target: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "备份执行失败";
    await updateBackupTargetStatus(target.id, { lastStatus: "failed", lastMessage: message }).catch(() => undefined);
    res.status(500).json({ ok: false, error: message });
  }
});

app.get("/api/backups/:id/files", async (req, res) => {
  const db = await readDb();
  const target = backupTargetsFrom(db).find((item) => item.id === req.params.id);
  if (!target) {
    res.status(404).json({ ok: false, error: "backup target not found" });
    return;
  }
  try {
    const files = await listRemoteBackups(target);
    res.json({ ok: true, files });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "备份列表读取失败" });
  }
});

app.post("/api/backups/:id/restore", async (req, res) => {
  const db = await readDb();
  const target = backupTargetsFrom(db).find((item) => item.id === req.params.id);
  const key = String(req.body?.key ?? "");
  if (!target) {
    res.status(404).json({ ok: false, error: "backup target not found" });
    return;
  }
  try {
    const payload = JSON.parse(await readRemoteBackup(target, key));
    await writeDb({
      assets: Array.isArray(payload.assets) ? payload.assets : [],
      domains: Array.isArray(payload.domains) ? payload.domains : [],
      channels: Array.isArray(payload.channels) ? payload.channels : [],
      ai: payload.aiConfig ?? payload.ai ?? {},
      settings: { ...(payload.settings ?? {}), backupTargets: db.settings.backupTargets ?? [] },
    });
    res.json({ ok: true, message: "备份已恢复", restoredAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "备份恢复失败" });
  }
});

app.delete("/api/backups/:id/files", async (req, res) => {
  const db = await readDb();
  const target = backupTargetsFrom(db).find((item) => item.id === req.params.id);
  const key = String(req.body?.key ?? "");
  if (!target) {
    res.status(404).json({ ok: false, error: "backup target not found" });
    return;
  }
  try {
    await deleteRemoteBackup(target, { key });
    res.json({ ok: true, message: "备份文件已删除", key });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "备份删除失败" });
  }
});

app.post("/api/backups/run-scheduled", async (_req, res) => {
  const db = await readDb();
  const targets = backupTargetsFrom(db);
  try {
    const results = await runDueBackups(targets, db);
    if (results.length) {
      const resultMap = new Map(results.map((item) => [item.id, item.result]));
      db.settings = {
        ...db.settings,
        backupTargets: targets.map((target) => {
          const result = resultMap.get(target.id);
          return result ? normalizeBackupTarget({ ...target, lastBackupAt: result.uploadedAt, nextBackupAt: result.nextBackupAt, lastStatus: "success", lastMessage: result.message }) : target;
        }),
      };
      await writeDb(db);
    }
    res.json({ ok: true, count: results.length, results });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "定时备份执行失败" });
  }
});

export default app;

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 8787);
  app.listen(port, () => {
    console.log(`YiHuoGe API listening on http://localhost:${port}`);
  });
}
