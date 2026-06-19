import { runBackup } from "../../_backups.js";

export default async function handler(req: any, res: any) {
  await runBackup(req, res);
}
