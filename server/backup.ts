import { createHash, createHmac } from "node:crypto";

export type BackupType = "WebDAV" | "S3";

export interface BackupTargetConfig {
  id: string;
  name: string;
  type: BackupType;
  target?: string;
  username?: string;
  password?: string;
  endpoint?: string;
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  prefix?: string;
  pathStyle?: boolean;
  scheduleEnabled?: boolean;
  scheduleIntervalHours?: number;
  lastBackupAt?: string;
  nextBackupAt?: string;
  retentionCount?: number;
  enabled: boolean;
  lastTestAt?: string;
  lastStatus?: "success" | "failed";
  lastMessage?: string;
  notes?: string;
}

export interface BackupDatabase {
  assets: unknown[];
  domains: unknown[];
  channels: unknown[];
  ai: Record<string, unknown>;
  settings: Record<string, unknown>;
}

interface RemoteBackupFile {
  key: string;
  url?: string;
  lastModified?: string;
}

export interface BackupActionResult {
  ok: boolean;
  message: string;
  fileName?: string;
  uploadedAt?: string;
  deleted?: string[];
  nextBackupAt?: string;
}

const BACKUP_PREFIX = "yihuoge-backup-";
const BACKUP_SUFFIX = ".json";
const DEFAULT_RETENTION = 7;
const DEFAULT_INTERVAL_HOURS = 24;
const MAX_RETENTION = 100;

function textEncoder() {
  return new TextEncoder();
}

function sha256Hex(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function encodePathPart(part: string) {
  return encodeURIComponent(part).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function cleanPath(value?: string) {
  return String(value ?? "").trim().replace(/^\/+|\/+$/g, "");
}

function retentionCount(target: BackupTargetConfig) {
  const value = Number(target.retentionCount ?? DEFAULT_RETENTION);
  if (!Number.isFinite(value)) return DEFAULT_RETENTION;
  return Math.min(MAX_RETENTION, Math.max(1, Math.floor(value)));
}

function intervalHours(target: BackupTargetConfig) {
  const value = Number(target.scheduleIntervalHours ?? DEFAULT_INTERVAL_HOURS);
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_HOURS;
  return Math.max(1, Math.floor(value));
}

function nextBackupAtFrom(baseIso: string, target: BackupTargetConfig) {
  return new Date(new Date(baseIso).getTime() + intervalHours(target) * 3600000).toISOString();
}

export function backupTargetSummary(target: BackupTargetConfig) {
  if (target.type === "WebDAV") return target.target || "";
  return [target.endpoint, target.bucket, cleanPath(target.prefix)].filter(Boolean).join(" / ");
}

export function normalizeBackupTarget(input: BackupTargetConfig): BackupTargetConfig {
  const target = { ...input };
  target.retentionCount = retentionCount(target);
  target.scheduleIntervalHours = intervalHours(target);
  if (target.type === "S3") {
    target.endpoint = String(target.endpoint ?? target.target ?? "").trim().replace(/\/+$/, "");
    target.region = String(target.region ?? "auto").trim() || "auto";
    target.bucket = String(target.bucket ?? "").trim();
    target.prefix = cleanPath(target.prefix);
    target.pathStyle = target.pathStyle !== false;
    target.target = backupTargetSummary(target);
  } else {
    target.target = String(target.target ?? "").trim();
  }
  return target;
}

function validateTarget(targetInput: BackupTargetConfig) {
  const target = normalizeBackupTarget(targetInput);
  if (!target.name?.trim()) throw new Error("请填写备份名称");
  if (target.type === "WebDAV") {
    if (!target.target) throw new Error("请填写 WebDAV 地址");
    try {
      new URL(target.target);
    } catch {
      throw new Error("WebDAV 地址格式不正确");
    }
  } else {
    if (!target.endpoint) throw new Error("请填写 S3 Endpoint");
    if (!target.bucket) throw new Error("请填写 Bucket");
    if (!target.accessKeyId) throw new Error("请填写 Access Key ID");
    if (!target.secretAccessKey) throw new Error("请填写 Secret Access Key");
    try {
      new URL(target.endpoint);
    } catch {
      throw new Error("S3 Endpoint 格式不正确");
    }
  }
  return target;
}

function backupFileName(date = new Date()) {
  return `${BACKUP_PREFIX}${date.toISOString().replace(/[:.]/g, "-")}${BACKUP_SUFFIX}`;
}

function buildPayload(db: BackupDatabase, target: BackupTargetConfig, createdAt: string) {
  const safeTargets = ((db.settings?.backupTargets as BackupTargetConfig[] | undefined) ?? []).map((item) => ({
    ...item,
    password: item.password ? "***" : "",
    secretAccessKey: item.secretAccessKey ? "***" : "",
  }));
  return JSON.stringify({
    exportedAt: createdAt,
    source: "YiHuoGe",
    settings: { ...db.settings, backupTargets: safeTargets },
    assets: db.assets ?? [],
    domains: db.domains ?? [],
    channels: db.channels ?? [],
    aiConfig: db.ai ?? {},
    backupTarget: { id: target.id, name: target.name, type: target.type },
  }, null, 2);
}

function webdavHeaders(target: BackupTargetConfig, extra: HeadersInit = {}) {
  const headers = new Headers(extra);
  if (target.username || target.password) {
    const token = Buffer.from(`${target.username ?? ""}:${target.password ?? ""}`).toString("base64");
    headers.set("Authorization", `Basic ${token}`);
  }
  return headers;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function webdavFileUrl(target: BackupTargetConfig, fileName = "") {
  const base = ensureTrailingSlash(target.target ?? "");
  return new URL(fileName.split("/").map(encodePathPart).join("/"), base).toString();
}

async function ensureWebdavCollection(target: BackupTargetConfig) {
  const response = await fetch(webdavFileUrl(target), { method: "MKCOL", headers: webdavHeaders(target) });
  if (![201, 405].includes(response.status)) {
    const text = await response.text().catch(() => "");
    throw new Error(`WebDAV 目录不可用：HTTP ${response.status}${text ? ` ${text.slice(0, 120)}` : ""}`);
  }
}

async function listWebdavBackups(target: BackupTargetConfig): Promise<RemoteBackupFile[]> {
  const response = await fetch(webdavFileUrl(target), {
    method: "PROPFIND",
    headers: webdavHeaders(target, { Depth: "1" }),
  });
  if (!response.ok && response.status !== 207) {
    const text = await response.text().catch(() => "");
    throw new Error(`WebDAV 列表读取失败：HTTP ${response.status}${text ? ` ${text.slice(0, 120)}` : ""}`);
  }
  const xml = await response.text();
  const files: RemoteBackupFile[] = [];
  const responseMatches = xml.match(/<[^:>]*:?response[\s\S]*?<\/[^:>]*:?response>/gi) ?? [];
  for (const item of responseMatches) {
    const href = item.match(/<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/i)?.[1]?.trim();
    const decoded = href ? decodeURIComponent(href).replace(/\/+$/g, "") : "";
    const key = decoded.split("/").pop() ?? "";
    if (!key.startsWith(BACKUP_PREFIX) || !key.endsWith(BACKUP_SUFFIX)) continue;
    const lastModified = item.match(/<[^:>]*:?getlastmodified[^>]*>([\s\S]*?)<\/[^:>]*:?getlastmodified>/i)?.[1]?.trim();
    files.push({ key, url: webdavFileUrl(target, key), lastModified });
  }
  return files;
}

async function putWebdavBackup(target: BackupTargetConfig, fileName: string, payload: string) {
  await ensureWebdavCollection(target).catch(() => undefined);
  const response = await fetch(webdavFileUrl(target, fileName), {
    method: "PUT",
    headers: webdavHeaders(target, { "Content-Type": "application/json; charset=utf-8" }),
    body: payload,
  });
  if (!response.ok && response.status !== 201 && response.status !== 204) {
    const text = await response.text().catch(() => "");
    throw new Error(`WebDAV 上传失败：HTTP ${response.status}${text ? ` ${text.slice(0, 120)}` : ""}`);
  }
}

async function deleteWebdavBackup(target: BackupTargetConfig, file: RemoteBackupFile) {
  const response = await fetch(file.url ?? webdavFileUrl(target, file.key), { method: "DELETE", headers: webdavHeaders(target) });
  if (!response.ok && response.status !== 404 && response.status !== 204) {
    throw new Error(`WebDAV 清理旧备份失败：${file.key} HTTP ${response.status}`);
  }
}

function s3Url(targetInput: BackupTargetConfig, key = "", query = "") {
  const target = normalizeBackupTarget(targetInput);
  const endpoint = new URL(target.endpoint!);
  const encodedKey = cleanPath(key).split("/").filter(Boolean).map(encodePathPart).join("/");
  if (target.pathStyle !== false) {
    endpoint.pathname = `/${[target.bucket, encodedKey].filter(Boolean).join("/")}`;
  } else {
    endpoint.hostname = `${target.bucket}.${endpoint.hostname}`;
    endpoint.pathname = encodedKey ? `/${encodedKey}` : "/";
  }
  endpoint.search = query;
  return endpoint;
}

function s3SigningKey(secret: string, date: string, region: string) {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function s3AmzDate(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, shortDate: iso.slice(0, 8) };
}

function canonicalQuery(url: URL) {
  return [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodePathPart(key)}=${encodePathPart(value)}`)
    .join("&");
}

function s3Headers(targetInput: BackupTargetConfig, method: string, url: URL, body = "", extra: Record<string, string> = {}) {
  const target = normalizeBackupTarget(targetInput);
  const region = target.region || "auto";
  const { amzDate, shortDate } = s3AmzDate();
  const payloadHash = sha256Hex(body);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key.toLowerCase(), value])),
  };
  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames.map((key) => `${key}:${headers[key].trim()}\n`).join("");
  const signedHeaders = sortedHeaderNames.join(";");
  const canonicalRequest = [
    method,
    url.pathname.split("/").map((part) => encodePathPart(decodeURIComponent(part))).join("/"),
    canonicalQuery(url),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${shortDate}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmacHex(s3SigningKey(target.secretAccessKey!, shortDate, region), stringToSign);
  return {
    ...extra,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${target.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function s3Fetch(target: BackupTargetConfig, method: string, key = "", query = "", body = "", extra: Record<string, string> = {}) {
  const url = s3Url(target, key, query);
  const response = await fetch(url, {
    method,
    headers: s3Headers(target, method, url, body, extra),
    body: method === "GET" || method === "HEAD" ? undefined : textEncoder().encode(body),
  });
  return response;
}

async function listS3Backups(target: BackupTargetConfig): Promise<RemoteBackupFile[]> {
  const prefix = cleanPath([target.prefix, BACKUP_PREFIX].filter(Boolean).join("/"));
  const query = `list-type=2&prefix=${encodePathPart(prefix)}`;
  const response = await s3Fetch(target, "GET", "", query);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`S3 列表读取失败：HTTP ${response.status}${text ? ` ${text.slice(0, 120)}` : ""}`);
  }
  const xml = await response.text();
  const contents = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? [];
  return contents.map((item) => {
    const key = item.match(/<Key>([\s\S]*?)<\/Key>/)?.[1]?.trim() ?? "";
    const lastModified = item.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1]?.trim();
    return { key: decodeURIComponent(key), lastModified };
  }).filter((file) => file.key.includes(BACKUP_PREFIX) && file.key.endsWith(BACKUP_SUFFIX));
}

async function putS3Backup(target: BackupTargetConfig, fileName: string, payload: string) {
  const key = cleanPath([target.prefix, fileName].filter(Boolean).join("/"));
  const response = await s3Fetch(target, "PUT", key, "", payload, { "Content-Type": "application/json; charset=utf-8" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`S3 上传失败：HTTP ${response.status}${text ? ` ${text.slice(0, 120)}` : ""}`);
  }
}

async function deleteS3Backup(target: BackupTargetConfig, file: RemoteBackupFile) {
  const response = await s3Fetch(target, "DELETE", file.key);
  if (!response.ok && response.status !== 404 && response.status !== 204) {
    throw new Error(`S3 清理旧备份失败：${file.key} HTTP ${response.status}`);
  }
}

async function listRemoteBackups(target: BackupTargetConfig) {
  return target.type === "WebDAV" ? listWebdavBackups(target) : listS3Backups(target);
}

async function uploadRemoteBackup(target: BackupTargetConfig, fileName: string, payload: string) {
  if (target.type === "WebDAV") return putWebdavBackup(target, fileName, payload);
  return putS3Backup(target, fileName, payload);
}

async function deleteRemoteBackup(target: BackupTargetConfig, file: RemoteBackupFile) {
  if (target.type === "WebDAV") return deleteWebdavBackup(target, file);
  return deleteS3Backup(target, file);
}

function sortBackups(files: RemoteBackupFile[]) {
  return [...files].sort((a, b) => {
    const byDate = new Date(b.lastModified ?? "").getTime() - new Date(a.lastModified ?? "").getTime();
    if (Number.isFinite(byDate) && byDate !== 0) return byDate;
    return b.key.localeCompare(a.key);
  });
}

async function pruneBackups(target: BackupTargetConfig) {
  const files = sortBackups(await listRemoteBackups(target));
  const stale = files.slice(retentionCount(target));
  const deleted: string[] = [];
  for (const file of stale) {
    await deleteRemoteBackup(target, file);
    deleted.push(file.key);
  }
  return deleted;
}

export async function testBackupTarget(targetInput: BackupTargetConfig): Promise<BackupActionResult> {
  const target = validateTarget(targetInput);
  if (target.type === "WebDAV") {
    await ensureWebdavCollection(target).catch(() => undefined);
    await listWebdavBackups(target);
  } else {
    await listS3Backups(target);
  }
  return { ok: true, message: "连接测试成功" };
}

export async function runBackupTarget(targetInput: BackupTargetConfig, db: BackupDatabase): Promise<BackupActionResult> {
  const target = validateTarget(targetInput);
  const uploadedAt = new Date().toISOString();
  const fileName = backupFileName(new Date(uploadedAt));
  const payload = buildPayload(db, target, uploadedAt);
  await uploadRemoteBackup(target, fileName, payload);
  const deleted = await pruneBackups(target);
  return {
    ok: true,
    message: `备份已完成，保留最新 ${retentionCount(target)} 份`,
    fileName,
    uploadedAt,
    deleted,
    nextBackupAt: nextBackupAtFrom(uploadedAt, target),
  };
}

export function isBackupDue(targetInput: BackupTargetConfig, now = new Date()) {
  const target = normalizeBackupTarget(targetInput);
  if (!target.enabled || !target.scheduleEnabled) return false;
  const next = target.nextBackupAt || (target.lastBackupAt ? nextBackupAtFrom(target.lastBackupAt, target) : "");
  if (!next) return true;
  return new Date(next).getTime() <= now.getTime();
}

export async function runDueBackups(targets: BackupTargetConfig[], db: BackupDatabase) {
  const results: Array<{ id: string; name: string; result: BackupActionResult }> = [];
  for (const target of targets) {
    if (!isBackupDue(target)) continue;
    const result = await runBackupTarget(target, db);
    results.push({ id: target.id, name: target.name, result });
  }
  return results;
}
