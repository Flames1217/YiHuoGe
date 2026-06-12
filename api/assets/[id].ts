import { hasValidAdminKey, readState, writeState } from "../_state.js";

export default async function handler(req: any, res: any) {
  if (!hasValidAdminKey(req)) {
    res.status(401).json({ error: "invalid admin key" });
    return;
  }

  const id = String(req.query.id ?? "");
  const db = await readState();

  if (req.method === "PUT") {
    let found = false;
    db.assets = db.assets.map((asset) => {
      if (asset.id !== id) return asset;
      found = true;
      return { ...asset, ...req.body, id };
    });
    if (!found) db.assets.unshift({ ...req.body, id });
    await writeState(db);
    res.status(200).json(db.assets.find((asset) => asset.id === id));
    return;
  }

  if (req.method === "DELETE") {
    db.assets = db.assets.filter((asset) => asset.id !== id);
    await writeState(db);
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
