import { hasValidAdminKey, readState, writeState } from "../_state.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "PUT") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!hasValidAdminKey(req)) {
    res.status(401).json({ error: "invalid admin key" });
    return;
  }
  const db = await readState();
  db.ai = { ...db.ai, ...req.body };
  await writeState(db);
  res.status(200).json(db.ai);
}
