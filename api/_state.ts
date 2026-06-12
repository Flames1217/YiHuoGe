import { existsSync, readFileSync, promises as fs } from "node:fs";
import path from "node:path";
import { createConnection } from "mysql2/promise";

const rootDir = process.cwd();

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

export interface YiHuoStateData {
  assets: any[];
  domains: any[];
  channels: any[];
  ai: Record<string, any>;
  settings: Record<string, any>;
}

const seed: YiHuoStateData = {
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

async function ensureMysqlTable(connection: Awaited<ReturnType<typeof createConnection>>) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS yihuoge_state (
      id VARCHAR(64) PRIMARY KEY,
      data LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

export async function readState(): Promise<YiHuoStateData> {
  if (mysqlUrl) {
    const connection = await createConnection({ uri: mysqlUrl, ssl: { rejectUnauthorized: true } });
    try {
      await ensureMysqlTable(connection);
      const [rows] = await connection.execute("SELECT data FROM yihuoge_state WHERE id = ?", ["main"]);
      const first = (rows as Array<{ data: string }>)[0];
      if (!first) {
        await connection.execute("INSERT INTO yihuoge_state (id, data) VALUES (?, ?)", ["main", JSON.stringify(seed)]);
        return seed;
      }
      return JSON.parse(first.data) as YiHuoStateData;
    } finally {
      await connection.end();
    }
  }
  try {
    return JSON.parse(await fs.readFile(dbFile, "utf8")) as YiHuoStateData;
  } catch {
    await fs.mkdir(path.dirname(dbFile), { recursive: true });
    await fs.writeFile(dbFile, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
}

export async function writeState(db: YiHuoStateData) {
  if (mysqlUrl) {
    const connection = await createConnection({ uri: mysqlUrl, ssl: { rejectUnauthorized: true } });
    try {
      await ensureMysqlTable(connection);
      await connection.execute(
        "INSERT INTO yihuoge_state (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
        ["main", JSON.stringify(db)],
      );
    } finally {
      await connection.end();
    }
    return;
  }
  await fs.mkdir(path.dirname(dbFile), { recursive: true });
  await fs.writeFile(dbFile, JSON.stringify(db, null, 2), "utf8");
}

export function hasValidAdminKey(req: any) {
  const adminKey = process.env.YIHUOGE_ADMIN_KEY ?? "";
  const headerKey = Array.isArray(req.headers["x-admin-key"]) ? req.headers["x-admin-key"][0] : req.headers["x-admin-key"];
  return !adminKey || headerKey === adminKey || req.headers.authorization === `Bearer ${adminKey}`;
}
