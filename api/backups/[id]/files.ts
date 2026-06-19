import { backupFiles } from "../../_backups.js";

export default async function handler(req: any, res: any) {
  await backupFiles(req, res);
}
