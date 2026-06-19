import { deleteRemoteBackup, listRemoteBackups, normalizeBackupTarget, readRemoteBackup, runBackupTarget, type BackupTargetConfig, type RemoteBackupFile } from "../server/backup.js";
import { hasValidAdminKey, readState, writeState } from "./_state.js";

type BackupTarget = BackupTargetConfig;

export function ensureBackupAuth(req: any, res: any) {
  if (hasValidAdminKey(req)) return true;
  res.status(401).json({ ok: false, error: "invalid admin key" });
  return false;
}

function backupTargetsFrom(db: any) {
  return Array.isArray(db.settings?.backupTargets) ? db.settings.backupTargets.map(normalizeBackupTarget) : [];
}

export async function updateBackupTargetStatus(id: string, patch: Partial<BackupTarget>) {
  const db = await readState() as any;
  const backupTargets = backupTargetsFrom(db).map((target) => (target.id === id ? normalizeBackupTarget({ ...target, ...patch }) : target));
  db.settings = { ...db.settings, backupTargets };
  await writeState(db);
  return backupTargets.find((target) => target.id === id);
}

export async function testBackup(req: any, res: any, testBackupTarget: (target: BackupTargetConfig) => Promise<any>) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  if (!ensureBackupAuth(req, res)) return;

  let target: BackupTarget | undefined;
  try {
    target = normalizeBackupTarget(req.body?.target ?? req.body);
    const result = await testBackupTarget(target);
    const patch = { lastTestAt: new Date().toISOString(), lastStatus: "success" as const, lastMessage: result.message };
    const nextTarget = target.id ? normalizeBackupTarget({ ...target, ...patch }) : undefined;
    if (target.id) void updateBackupTargetStatus(target.id, patch).catch(() => undefined);
    res.status(200).json({ ...result, target: nextTarget });
  } catch (error) {
    const message = error instanceof Error ? error.message : "备份连接测试失败";
    if (target?.id) void updateBackupTargetStatus(target.id, { lastTestAt: new Date().toISOString(), lastStatus: "failed", lastMessage: message }).catch(() => undefined);
    res.status(400).json({ ok: false, error: message });
  }
}

export async function findBackupTarget(id: string, bodyTarget?: BackupTarget) {
  const db = await readState() as any;
  const fallbackTarget = bodyTarget?.id === id ? normalizeBackupTarget(bodyTarget) : undefined;
  return { db, target: backupTargetsFrom(db).find((item) => item.id === id) ?? fallbackTarget };
}

export async function runBackup(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  if (!ensureBackupAuth(req, res)) return;

  const id = String(req.query.id ?? "");
  const { db, target } = await findBackupTarget(id, req.body?.target);
  if (!target) {
    res.status(404).json({ ok: false, error: "backup target not found" });
    return;
  }

  try {
    const result = await runBackupTarget(target, db);
    const saved = await updateBackupTargetStatus(target.id, { lastBackupAt: result.uploadedAt, nextBackupAt: result.nextBackupAt, lastStatus: "success", lastMessage: result.message });
    res.status(200).json({ ...result, target: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "备份执行失败";
    await updateBackupTargetStatus(target.id, { lastStatus: "failed", lastMessage: message }).catch(() => undefined);
    res.status(500).json({ ok: false, error: message });
  }
}

export async function backupFiles(req: any, res: any) {
  if (!ensureBackupAuth(req, res)) return;

  const id = String(req.query.id ?? "");
  const { db, target } = await findBackupTarget(id);
  if (!target) {
    res.status(404).json({ ok: false, error: "backup target not found" });
    return;
  }

  if (req.method === "GET") {
    try {
      const files = await listRemoteBackups(target);
      res.status(200).json({ ok: true, files });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "备份列表读取失败" });
    }
    return;
  }

  if (req.method === "DELETE") {
    const key = String(req.query.key ?? req.body?.key ?? "");
    if (!key) {
      res.status(400).json({ ok: false, error: "缺少备份文件名" });
      return;
    }
    try {
      await deleteRemoteBackup(target, { key } as RemoteBackupFile);
      res.status(200).json({ ok: true, message: "备份文件已删除", key });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "备份删除失败" });
    }
    return;
  }

  res.status(405).json({ ok: false, error: "method not allowed" });
}

export async function restoreBackup(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  if (!ensureBackupAuth(req, res)) return;

  const id = String(req.query.id ?? "");
  const key = String(req.body?.key ?? "");
  const { db, target } = await findBackupTarget(id);
  if (!target) {
    res.status(404).json({ ok: false, error: "backup target not found" });
    return;
  }
  if (!key) {
    res.status(400).json({ ok: false, error: "缺少备份文件名" });
    return;
  }

  try {
    const payload = await readRemoteBackup(target, key);
    const restored = JSON.parse(payload);
    await writeState({
      assets: restored.assets ?? [],
      domains: restored.domains ?? [],
      channels: restored.channels ?? [],
      ai: restored.aiConfig ?? restored.ai ?? {},
      settings: { ...(restored.settings ?? {}), backupTargets: db.settings?.backupTargets ?? [] },
    });
    res.status(200).json({ ok: true, message: "备份已恢复", key });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "备份恢复失败" });
  }
}
