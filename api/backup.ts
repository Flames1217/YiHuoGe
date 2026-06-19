import { testBackupTarget } from "../server/backup.js";
import { backupFiles, restoreBackup, runBackup, testBackup } from "./_backups.js";

export default async function handler(req: any, res: any) {
  const action = String(req.query.action ?? "");
  if (action === "test") return testBackup(req, res, testBackupTarget);
  if (action === "run") return runBackup(req, res);
  if (action === "files") return backupFiles(req, res);
  if (action === "restore") return restoreBackup(req, res);
  res.status(404).json({ ok: false, error: "backup action not found" });
}
