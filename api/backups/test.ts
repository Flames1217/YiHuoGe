import { testBackupTarget } from "../../server/backup.js";
import { testBackup } from "../_backups.js";

export default async function handler(req: any, res: any) {
  await testBackup(req, res, testBackupTarget);
}
