import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
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

const mysqlUrl = process.env.MYSQL_URL ?? "";
const defaultSqliteFile = process.env.YIHUOGE_SQLITE_FILE ?? path.join(rootDir, "data", "yihuoge.sqlite");

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
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"],
    defaultModel: "gpt-4.1-mini",
  },
  settings: {
    language: "zh",
    timezone: "Asia/Shanghai",
    currency: "CNY",
    reminderDays: [30, 14, 7, 3, 1],
    defaultChannel: "",
    theme: "dark-fire",
    moduleOrder: ["overview", "assets", "notifications", "ai", "settings"],
    backupTargets: [],
  },
};

type StorageKind = "d1" | "mysql" | "postgres" | "sqlite";

type SqlDialect = "mysql" | "postgres" | "sqlite";

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === "") return fallback;
  try {
    return typeof value === "string" ? JSON.parse(value) as T : value as T;
  } catch {
    return fallback;
  }
}

function mergeSeed(db: Partial<YiHuoStateData>): YiHuoStateData {
  return {
    assets: Array.isArray(db.assets) ? db.assets : [],
    domains: Array.isArray(db.domains) ? db.domains : [],
    channels: Array.isArray(db.channels) ? db.channels : [],
    ai: { ...seed.ai, ...(db.ai ?? {}) },
    settings: { ...seed.settings, ...(db.settings ?? {}) },
  };
}

function d1Binding(): any | undefined {
  const globalObject = globalThis as any;
  return globalObject.YIHUOGE_D1 ?? globalObject.DB ?? globalObject.D1;
}

function storageKind(): StorageKind {
  if (d1Binding()) return "d1";
  if (/^postgres(?:ql)?:\/\//i.test(mysqlUrl)) return "postgres";
  if (/^(?:mysql|mariadb):\/\//i.test(mysqlUrl)) return "mysql";
  if (/^(?:sqlite|file):/i.test(mysqlUrl)) return "sqlite";
  return "sqlite";
}

function sqliteFilename() {
  if (!mysqlUrl) return defaultSqliteFile;
  if (mysqlUrl === "sqlite::memory:" || mysqlUrl === ":memory:") return ":memory:";
  if (mysqlUrl.startsWith("file:")) return mysqlUrl.slice("file:".length);
  return mysqlUrl.replace(/^sqlite:\/\/?/i, "") || defaultSqliteFile;
}

function columnsFor(dialect: SqlDialect) {
  const longText = dialect === "postgres" ? "TEXT" : "LONGTEXT";
  const text = dialect === "mysql" ? "VARCHAR(1024)" : "TEXT";
  const id = dialect === "postgres" ? "TEXT PRIMARY KEY" : "VARCHAR(64) PRIMARY KEY";
  const bool = dialect === "postgres" ? "BOOLEAN" : dialect === "mysql" ? "TINYINT(1)" : "INTEGER";
  const money = dialect === "postgres" ? "NUMERIC(18,4)" : dialect === "mysql" ? "DECIMAL(18,4)" : "REAL";
  const now = dialect === "postgres" ? "TIMESTAMPTZ DEFAULT NOW()" : dialect === "mysql" ? "TIMESTAMP DEFAULT CURRENT_TIMESTAMP" : "TEXT DEFAULT CURRENT_TIMESTAMP";
  const autoUpdate = dialect === "mysql" ? " ON UPDATE CURRENT_TIMESTAMP" : "";
  return { longText, text, id, bool, money, now, autoUpdate };
}

function schemaStatements(dialect: SqlDialect) {
  const c = columnsFor(dialect);
  return [
    `CREATE TABLE IF NOT EXISTS yh_assets (
      id ${c.id},
      name ${c.text} NOT NULL,
      type VARCHAR(32) NOT NULL,
      provider ${c.text} NOT NULL DEFAULT '',
      provider_url ${c.text},
      host_provider ${c.text},
      host_url ${c.text},
      account ${c.text} NOT NULL DEFAULT '',
      renewal_date VARCHAR(32) NOT NULL,
      price ${c.money} NOT NULL DEFAULT 0,
      currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
      cycle VARCHAR(16) NOT NULL DEFAULT 'custom',
      status VARCHAR(16) NOT NULL DEFAULT 'healthy',
      url ${c.text},
      tags_json ${c.longText},
      notes ${c.longText},
      created_at ${c.now},
      updated_at ${c.now}${c.autoUpdate}
    )`,
    `CREATE TABLE IF NOT EXISTS yh_domains (
      id ${c.id},
      name ${c.text} NOT NULL,
      type VARCHAR(32) NOT NULL DEFAULT 'domain',
      provider ${c.text} NOT NULL DEFAULT '',
      provider_url ${c.text},
      host_provider ${c.text},
      host_url ${c.text},
      account ${c.text} NOT NULL DEFAULT '',
      renewal_date VARCHAR(32) NOT NULL,
      price ${c.money} NOT NULL DEFAULT 0,
      currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
      cycle VARCHAR(16) NOT NULL DEFAULT 'custom',
      status VARCHAR(16) NOT NULL DEFAULT 'healthy',
      url ${c.text},
      tags_json ${c.longText},
      notes ${c.longText},
      registrar ${c.text},
      domain_created_at VARCHAR(32),
      expires_at VARCHAR(32),
      dns_json ${c.longText},
      whois_status_json ${c.longText},
      created_at ${c.now},
      updated_at ${c.now}${c.autoUpdate}
    )`,
    `CREATE TABLE IF NOT EXISTS yh_channels (
      id ${c.id},
      name ${c.text} NOT NULL,
      type VARCHAR(64) NOT NULL,
      enabled ${c.bool} NOT NULL DEFAULT 1,
      target ${c.text} NOT NULL DEFAULT '',
      last_test ${c.text},
      secret_masked ${c.text},
      config_json ${c.longText},
      template ${c.longText},
      created_at ${c.now},
      updated_at ${c.now}${c.autoUpdate}
    )`,
    `CREATE TABLE IF NOT EXISTS yh_ai_config (
      id VARCHAR(32) PRIMARY KEY,
      provider ${c.text} NOT NULL,
      api_key ${c.longText},
      base_url ${c.text} NOT NULL,
      models_json ${c.longText} NOT NULL,
      default_model ${c.text} NOT NULL,
      updated_at ${c.now}${c.autoUpdate}
    )`,
    `CREATE TABLE IF NOT EXISTS yh_settings (
      key_name VARCHAR(64) PRIMARY KEY,
      value_json ${c.longText} NOT NULL,
      updated_at ${c.now}${c.autoUpdate}
    )`,
  ];
}

const assetColumns = ["id", "name", "type", "provider", "provider_url", "host_provider", "host_url", "account", "renewal_date", "price", "currency", "cycle", "status", "url", "tags_json", "notes"];
const domainColumns = [...assetColumns, "registrar", "domain_created_at", "expires_at", "dns_json", "whois_status_json"];
const channelColumns = ["id", "name", "type", "enabled", "target", "last_test", "secret_masked", "config_json", "template"];

function assetValues(asset: any) {
  return [asset.id, asset.name, asset.type, asset.provider ?? "", asset.providerUrl ?? "", asset.hostProvider ?? "", asset.hostUrl ?? "", asset.account ?? "", asset.renewalDate, Number(asset.price ?? 0), asset.currency ?? "CNY", asset.cycle ?? "custom", asset.status ?? "healthy", asset.url ?? "", json(asset.tags ?? []), asset.notes ?? ""];
}

function domainValues(domain: any) {
  return [...assetValues(domain), domain.registrar ?? domain.provider ?? "", domain.createdAt ?? "", domain.expiresAt ?? domain.renewalDate ?? "", json(domain.dns ?? []), json(domain.whoisStatus ?? [])];
}

function channelValues(channel: any) {
  return [channel.id, channel.name, channel.type, channel.enabled ? 1 : 0, channel.target ?? "", channel.lastTest ?? "", channel.secretMasked ?? "", json(channel.config ?? {}), channel.template ?? ""];
}

function rowToAsset(row: any) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    provider: row.provider ?? "",
    providerUrl: row.provider_url ?? undefined,
    hostProvider: row.host_provider ?? undefined,
    hostUrl: row.host_url ?? undefined,
    account: row.account ?? "",
    renewalDate: row.renewal_date,
    price: Number(row.price ?? 0),
    currency: row.currency ?? "CNY",
    cycle: row.cycle ?? "custom",
    status: row.status ?? "healthy",
    url: row.url ?? undefined,
    tags: parseJson<string[]>(row.tags_json, []),
    notes: row.notes ?? undefined,
  };
}

function rowToDomain(row: any) {
  return {
    ...rowToAsset(row),
    type: "domain",
    registrar: row.registrar ?? row.provider ?? "",
    createdAt: row.domain_created_at ?? "",
    expiresAt: row.expires_at ?? row.renewal_date ?? "",
    dns: parseJson<string[]>(row.dns_json, []),
    whoisStatus: parseJson<string[]>(row.whois_status_json, []),
  };
}

function rowToChannel(row: any) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: Boolean(row.enabled),
    target: row.target ?? "",
    lastTest: row.last_test ?? undefined,
    secretMasked: row.secret_masked ?? undefined,
    config: parseJson<Record<string, string>>(row.config_json, {}),
    template: row.template ?? undefined,
  };
}

function mysqlInsert(table: string, columns: string[]) {
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
}

function pgInsert(table: string, columns: string[]) {
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`;
}

async function readMysql(): Promise<YiHuoStateData> {
  const connection = await createConnection({ uri: mysqlUrl, ssl: { rejectUnauthorized: true } });
  try {
    for (const sql of schemaStatements("mysql")) await connection.execute(sql);
    const [assetRows] = await connection.execute("SELECT * FROM yh_assets ORDER BY created_at DESC");
    const [domainRows] = await connection.execute("SELECT * FROM yh_domains ORDER BY created_at DESC");
    const [channelRows] = await connection.execute("SELECT * FROM yh_channels ORDER BY created_at DESC");
    const [aiRows] = await connection.execute("SELECT * FROM yh_ai_config WHERE id = ?", ["main"]);
    const [settingRows] = await connection.execute("SELECT * FROM yh_settings WHERE key_name = ?", ["main"]);
    const db = mergeSeed({
      assets: (assetRows as any[]).map(rowToAsset),
      domains: (domainRows as any[]).map(rowToDomain),
      channels: (channelRows as any[]).map(rowToChannel),
      ai: (aiRows as any[])[0] ? {
        provider: (aiRows as any[])[0].provider,
        apiKey: (aiRows as any[])[0].api_key ?? "",
        baseUrl: (aiRows as any[])[0].base_url,
        models: parseJson<string[]>((aiRows as any[])[0].models_json, []),
        defaultModel: (aiRows as any[])[0].default_model,
      } : seed.ai,
      settings: (settingRows as any[])[0] ? parseJson<Record<string, any>>((settingRows as any[])[0].value_json, seed.settings) : seed.settings,
    });
    if (!db.assets.length && !db.channels.length) {
      const [legacyRows] = await connection.execute("SELECT data FROM yihuoge_state WHERE id = ?", ["main"]).catch(() => [[]]);
      const legacy = (legacyRows as any[])[0]?.data;
      if (legacy) {
        const migrated = mergeSeed(JSON.parse(legacy));
        await writeMysql(migrated);
        return migrated;
      }
    }
    return db;
  } finally {
    await connection.end();
  }
}

async function writeMysql(dbInput: YiHuoStateData) {
  const db = mergeSeed(dbInput);
  const connection = await createConnection({ uri: mysqlUrl, ssl: { rejectUnauthorized: true } });
  try {
    for (const sql of schemaStatements("mysql")) await connection.execute(sql);
    await connection.beginTransaction();
    try {
      for (const table of ["yh_assets", "yh_domains", "yh_channels", "yh_ai_config", "yh_settings"]) await connection.execute(`DELETE FROM ${table}`);
      for (const asset of db.assets) await connection.execute(mysqlInsert("yh_assets", assetColumns), assetValues(asset));
      for (const domain of db.domains) await connection.execute(mysqlInsert("yh_domains", domainColumns), domainValues(domain));
      for (const channel of db.channels) await connection.execute(mysqlInsert("yh_channels", channelColumns), channelValues(channel));
      await connection.execute(mysqlInsert("yh_ai_config", ["id", "provider", "api_key", "base_url", "models_json", "default_model"]), ["main", db.ai.provider, db.ai.apiKey ?? "", db.ai.baseUrl, json(db.ai.models ?? []), db.ai.defaultModel ?? ""]);
      await connection.execute(mysqlInsert("yh_settings", ["key_name", "value_json"]), ["main", json(db.settings)]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

async function withPostgres<T>(fn: (client: any) => Promise<T>) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: mysqlUrl, ssl: mysqlUrl.includes("sslmode=disable") ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function readPostgres(): Promise<YiHuoStateData> {
  return withPostgres(async (client) => {
    for (const sql of schemaStatements("postgres")) await client.query(sql);
    const [assets, domains, channels, ai, settings] = await Promise.all([
      client.query("SELECT * FROM yh_assets ORDER BY created_at DESC"),
      client.query("SELECT * FROM yh_domains ORDER BY created_at DESC"),
      client.query("SELECT * FROM yh_channels ORDER BY created_at DESC"),
      client.query("SELECT * FROM yh_ai_config WHERE id = $1", ["main"]),
      client.query("SELECT * FROM yh_settings WHERE key_name = $1", ["main"]),
    ]);
    return mergeSeed({
      assets: assets.rows.map(rowToAsset),
      domains: domains.rows.map(rowToDomain),
      channels: channels.rows.map(rowToChannel),
      ai: ai.rows[0] ? { provider: ai.rows[0].provider, apiKey: ai.rows[0].api_key ?? "", baseUrl: ai.rows[0].base_url, models: parseJson<string[]>(ai.rows[0].models_json, []), defaultModel: ai.rows[0].default_model } : seed.ai,
      settings: settings.rows[0] ? parseJson<Record<string, any>>(settings.rows[0].value_json, seed.settings) : seed.settings,
    });
  });
}

async function writePostgres(dbInput: YiHuoStateData) {
  const db = mergeSeed(dbInput);
  await withPostgres(async (client) => {
    for (const sql of schemaStatements("postgres")) await client.query(sql);
    await client.query("BEGIN");
    try {
      for (const table of ["yh_assets", "yh_domains", "yh_channels", "yh_ai_config", "yh_settings"]) await client.query(`DELETE FROM ${table}`);
      for (const asset of db.assets) await client.query(pgInsert("yh_assets", assetColumns), assetValues(asset));
      for (const domain of db.domains) await client.query(pgInsert("yh_domains", domainColumns), domainValues(domain));
      for (const channel of db.channels) await client.query(pgInsert("yh_channels", channelColumns), channelValues(channel));
      await client.query(pgInsert("yh_ai_config", ["id", "provider", "api_key", "base_url", "models_json", "default_model"]), ["main", db.ai.provider, db.ai.apiKey ?? "", db.ai.baseUrl, json(db.ai.models ?? []), db.ai.defaultModel ?? ""]);
      await client.query(pgInsert("yh_settings", ["key_name", "value_json"]), ["main", json(db.settings)]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function openSqlite() {
  const filename = sqliteFilename();
  if (filename !== ":memory:") await mkdir(path.dirname(path.resolve(filename)), { recursive: true });
  const sqlite3 = await import("sqlite3");
  const { open } = await import("sqlite");
  return open({ filename, driver: sqlite3.default.Database });
}

async function readSqlite(): Promise<YiHuoStateData> {
  const db = await openSqlite();
  try {
    for (const sql of schemaStatements("sqlite")) await db.exec(sql);
    const assets = await db.all("SELECT * FROM yh_assets ORDER BY created_at DESC");
    const domains = await db.all("SELECT * FROM yh_domains ORDER BY created_at DESC");
    const channels = await db.all("SELECT * FROM yh_channels ORDER BY created_at DESC");
    const ai = await db.get("SELECT * FROM yh_ai_config WHERE id = ?", "main");
    const settings = await db.get("SELECT * FROM yh_settings WHERE key_name = ?", "main");
    return mergeSeed({
      assets: assets.map(rowToAsset),
      domains: domains.map(rowToDomain),
      channels: channels.map(rowToChannel),
      ai: ai ? { provider: ai.provider, apiKey: ai.api_key ?? "", baseUrl: ai.base_url, models: parseJson<string[]>(ai.models_json, []), defaultModel: ai.default_model } : seed.ai,
      settings: settings ? parseJson<Record<string, any>>(settings.value_json, seed.settings) : seed.settings,
    });
  } finally {
    await db.close();
  }
}

async function writeSqlite(dbInput: YiHuoStateData) {
  const data = mergeSeed(dbInput);
  const db = await openSqlite();
  try {
    for (const sql of schemaStatements("sqlite")) await db.exec(sql);
    await db.exec("BEGIN");
    try {
      for (const table of ["yh_assets", "yh_domains", "yh_channels", "yh_ai_config", "yh_settings"]) await db.run(`DELETE FROM ${table}`);
      const insert = (table: string, columns: string[]) => `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
      for (const asset of data.assets) await db.run(insert("yh_assets", assetColumns), assetValues(asset));
      for (const domain of data.domains) await db.run(insert("yh_domains", domainColumns), domainValues(domain));
      for (const channel of data.channels) await db.run(insert("yh_channels", channelColumns), channelValues(channel));
      await db.run(insert("yh_ai_config", ["id", "provider", "api_key", "base_url", "models_json", "default_model"]), ["main", data.ai.provider, data.ai.apiKey ?? "", data.ai.baseUrl, json(data.ai.models ?? []), data.ai.defaultModel ?? ""]);
      await db.run(insert("yh_settings", ["key_name", "value_json"]), ["main", json(data.settings)]);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    await db.close();
  }
}

async function d1All(db: any, sql: string, params: any[] = []) {
  const result = await db.prepare(sql).bind(...params).all();
  return result.results ?? [];
}

async function d1First(db: any, sql: string, params: any[] = []) {
  return db.prepare(sql).bind(...params).first();
}

async function d1Run(db: any, sql: string, params: any[] = []) {
  return db.prepare(sql).bind(...params).run();
}

async function readD1(): Promise<YiHuoStateData> {
  const db = d1Binding();
  for (const sql of schemaStatements("sqlite")) await d1Run(db, sql);
  const assets = await d1All(db, "SELECT * FROM yh_assets ORDER BY created_at DESC");
  const domains = await d1All(db, "SELECT * FROM yh_domains ORDER BY created_at DESC");
  const channels = await d1All(db, "SELECT * FROM yh_channels ORDER BY created_at DESC");
  const ai = await d1First(db, "SELECT * FROM yh_ai_config WHERE id = ?", ["main"]);
  const settings = await d1First(db, "SELECT * FROM yh_settings WHERE key_name = ?", ["main"]);
  return mergeSeed({
    assets: assets.map(rowToAsset),
    domains: domains.map(rowToDomain),
    channels: channels.map(rowToChannel),
    ai: ai ? { provider: ai.provider, apiKey: ai.api_key ?? "", baseUrl: ai.base_url, models: parseJson<string[]>(ai.models_json, []), defaultModel: ai.default_model } : seed.ai,
    settings: settings ? parseJson<Record<string, any>>(settings.value_json, seed.settings) : seed.settings,
  });
}

async function writeD1(dbInput: YiHuoStateData) {
  const data = mergeSeed(dbInput);
  const db = d1Binding();
  for (const sql of schemaStatements("sqlite")) await d1Run(db, sql);
  for (const table of ["yh_assets", "yh_domains", "yh_channels", "yh_ai_config", "yh_settings"]) await d1Run(db, `DELETE FROM ${table}`);
  const insert = (table: string, columns: string[]) => `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  for (const asset of data.assets) await d1Run(db, insert("yh_assets", assetColumns), assetValues(asset));
  for (const domain of data.domains) await d1Run(db, insert("yh_domains", domainColumns), domainValues(domain));
  for (const channel of data.channels) await d1Run(db, insert("yh_channels", channelColumns), channelValues(channel));
  await d1Run(db, insert("yh_ai_config", ["id", "provider", "api_key", "base_url", "models_json", "default_model"]), ["main", data.ai.provider, data.ai.apiKey ?? "", data.ai.baseUrl, json(data.ai.models ?? []), data.ai.defaultModel ?? ""]);
  await d1Run(db, insert("yh_settings", ["key_name", "value_json"]), ["main", json(data.settings)]);
}

export async function readState(): Promise<YiHuoStateData> {
  const kind = storageKind();
  if (kind === "d1") return readD1();
  if (kind === "postgres") return readPostgres();
  if (kind === "mysql") return readMysql();
  return readSqlite();
}

export async function writeState(db: YiHuoStateData) {
  const kind = storageKind();
  if (kind === "d1") return writeD1(db);
  if (kind === "postgres") return writePostgres(db);
  if (kind === "mysql") return writeMysql(db);
  return writeSqlite(db);
}

export function hasValidAdminKey(req: any) {
  const adminKey = process.env.YIHUOGE_ADMIN_KEY ?? "";
  const headerKey = Array.isArray(req.headers["x-admin-key"]) ? req.headers["x-admin-key"][0] : req.headers["x-admin-key"];
  return !adminKey || headerKey === adminKey || req.headers.authorization === `Bearer ${adminKey}`;
}

export const storageInfo = {
  kind: storageKind,
  tables: ["yh_assets", "yh_domains", "yh_channels", "yh_ai_config", "yh_settings"],
};
