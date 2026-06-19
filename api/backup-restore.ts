import { restoreBackup } from "./_backups.js";

export default async function handler(req: any, res: any) {
  await restoreBackup(req, res);
}
