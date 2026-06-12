import cors from "cors";
import express from "express";
import type { Request } from "express";
import { existsSync, readFileSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { createConnection } from "mysql2/promise";
import { sendNotificationTest } from "../server/notify.js";

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

const dbFile = process.env.YIHUOGE_DB_FILE ?? (process.env.VERCEL ? "/tmp/yihuoge.json" : path.join(rootDir, "data", "yihuoge.json"));
const mysqlUrl = process.env.MYSQL_URL ?? process.env.DATABASE_URL ?? "";
const adminKey = process.env.YIHUOGE_ADMIN_KEY ?? "";

type AssetType = "domain" | "vps" | "cloud" | "ai" | "membership" | "custom";
type AssetStatus = "healthy" | "warning" | "critical" | "expired";

interface Asset {
  id: string;
  name: string;
  type: AssetType;
  provider: string;
  account: string;
  renewalDate: string;
  price: number;
  currency: string;
  cycle: "monthly" | "yearly" | "custom";
  status: AssetStatus;
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
  settings: Record<string, unknown>;
}

const seed: Database = {
  assets: [],
  domains: [],
  channels: [],
  ai: {
    provider: "OpenAI Compatible",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"],
    defaultModel: "gpt-4.1-mini",
  },
  settings: {
    language: "zh",
    timezone: "Asia/Shanghai",
    currency: "CNY",
    backupTargets: [],
  },
};

async function readMysqlDb(): Promise<Database> {
  const connection = await createConnection({
    uri: mysqlUrl,
    ssl: { rejectUnauthorized: true },
  });
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS yihuoge_state (
        id VARCHAR(64) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    const [rows] = await connection.execute("SELECT data FROM yihuoge_state WHERE id = ?", ["main"]);
    const first = (rows as Array<{ data: string }>)[0];
    if (!first) {
      await connection.execute("INSERT INTO yihuoge_state (id, data) VALUES (?, ?)", ["main", JSON.stringify(seed)]);
      return seed;
    }
    return JSON.parse(first.data) as Database;
  } finally {
    await connection.end();
  }
}

async function writeMysqlDb(db: Database) {
  const connection = await createConnection({
    uri: mysqlUrl,
    ssl: { rejectUnauthorized: true },
  });
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS yihuoge_state (
        id VARCHAR(64) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await connection.execute(
      "INSERT INTO yihuoge_state (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
      ["main", JSON.stringify(db)],
    );
  } finally {
    await connection.end();
  }
}

async function readDb(): Promise<Database> {
  if (mysqlUrl) return readMysqlDb();
  try {
    return JSON.parse(await fs.readFile(dbFile, "utf8")) as Database;
  } catch {
    await fs.mkdir(path.dirname(dbFile), { recursive: true });
    await fs.writeFile(dbFile, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
}

async function writeDb(db: Database) {
  if (mysqlUrl) {
    await writeMysqlDb(db);
    return;
  }
  await fs.mkdir(path.dirname(dbFile), { recursive: true });
  await fs.writeFile(dbFile, JSON.stringify(db, null, 2), "utf8");
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "3mb" }));

function hasValidAdminKey(req: Request) {
  return !adminKey || req.header("x-admin-key") === adminKey || req.header("authorization") === `Bearer ${adminKey}`;
}

app.use((req, res, next) => {
  const protectedMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const protectedRead = req.path.startsWith("/api/bootstrap") || req.path.startsWith("/api/assets") || req.path.startsWith("/api/channels") || req.path.startsWith("/api/settings");
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

app.get("/api/assets", async (_req, res) => {
  const db = await readDb();
  res.json(db.assets);
});

app.post("/api/assets", async (req, res) => {
  const db = await readDb();
  const asset = { id: nanoid(10), status: "healthy", tags: [], ...req.body } as Asset;
  db.assets.unshift(asset);
  await writeDb(db);
  res.status(201).json(asset);
});

app.put("/api/assets/:id", async (req, res) => {
  const db = await readDb();
  db.assets = db.assets.map((asset) => (asset.id === req.params.id ? { ...asset, ...req.body, id: asset.id } : asset));
  await writeDb(db);
  res.json(db.assets.find((asset) => asset.id === req.params.id));
});

app.delete("/api/assets/:id", async (req, res) => {
  const db = await readDb();
  db.assets = db.assets.filter((asset) => asset.id !== req.params.id);
  await writeDb(db);
  res.status(204).send();
});

app.get("/api/domains", async (_req, res) => {
  const db = await readDb();
  res.json(db.domains);
});

app.get("/api/whois/:domain", async (req, res) => {
  const db = await readDb();
  const found = db.domains.find((domain) => domain.name.toLowerCase() === req.params.domain.toLowerCase());
  res.json(
    found ?? {
      name: req.params.domain,
      registrar: "Unknown / adapter pending",
      whoisStatus: ["lookup-adapter-not-configured"],
      dns: [],
      note: "接入 whois-json、RDAP 或 registrar API 后替换该适配器。",
    },
  );
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


const MODEL_FETCH_TIMEOUT_MS = 18000;

function modelEndpointCandidates(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return [];
  const urls = new Set<string>();
  if (/\/models$/i.test(base)) urls.add(base);
  else {
    urls.add(`${base}/models`);
    if (!/\/(?:v\d+(?:beta)?|openai\/v\d+(?:beta)?|compatible-mode\/v\d+)$/i.test(base)) {
      urls.add(`${base}/v1/models`);
    }
  }
  return [...urls];
}

function extractModelIds(payload: any): string[] {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload?.modelList)
          ? payload.modelList
          : payload?.data && typeof payload.data === "object"
            ? Object.values(payload.data)
            : payload?.models && typeof payload.models === "object"
              ? Object.values(payload.models)
              : [];

  const ids = source
    .map((item: any) => typeof item === "string" ? item : item?.id ?? item?.name ?? item?.model ?? item?.model_name)
    .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id: string) => id.trim());
  return Array.from(new Set<string>(ids));
}

async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<{ models: string[]; endpoint: string }> {
  const endpoints = modelEndpointCandidates(baseUrl);
  if (!endpoints.length) throw new Error("请先填写接口地址");
  const errors: string[] = [];
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(apiKey ? { Authorization: /^Bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`, "x-api-key": apiKey.replace(/^Bearer\s+/i, "") } : {}),
          "anthropic-version": "2023-06-01",
        },
      });
      const text = await response.text();
      if (!response.ok) {
        errors.push(`${endpoint} -> HTTP ${response.status}${text ? `?${text.slice(0, 160)}` : ""}`);
        continue;
      }
      const payload = text ? JSON.parse(text) : null;
      const models = extractModelIds(payload);
      if (models.length) return { models, endpoint };
      errors.push(`${endpoint} -> 未发现模型字段`);
    } catch (error) {
      errors.push(`${endpoint} -> ${error instanceof Error ? error.message : "请求失败"}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`远端未返回可用模型。已尝试：${errors.join("；")}`);
}

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

app.post("/api/ai/import", async (req, res) => {
  const text = String(req.body.text ?? "");
  const assets = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [name = `Imported ${index + 1}`, type = "custom", provider = "Custom", renewalDate = "2026-12-31", price = "0"] = line
        .split(/,|\t/)
        .map((part) => part.trim());
      return {
        id: nanoid(10),
        name,
        type: ["domain", "vps", "cloud", "ai", "membership", "custom"].includes(type) ? type : "custom",
        provider,
        account: "ai-import",
        renewalDate,
        price: Number(price) || 0,
        currency: "USD",
        cycle: "monthly",
        status: "healthy",
        tags: ["ai-import"],
      };
    });
  const db = await readDb();
  db.assets.unshift(...(assets as Asset[]));
  await writeDb(db);
  res.json({ assets, count: assets.length });
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

export default app;

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 8787);
  app.listen(port, () => {
    console.log(`YiHuoGe API listening on http://localhost:${port}`);
  });
}
