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
    db.channels = db.channels.map((channel) => {
      if (channel.id !== id) return channel;
      found = true;
      return { ...channel, ...req.body, id };
    });
    if (!found) db.channels.unshift({ ...req.body, id });
    await writeState(db);
    res.status(200).json(db.channels.find((channel) => channel.id === id));
    return;
  }

  if (req.method === "DELETE") {
    db.channels = db.channels.filter((channel) => channel.id !== id);
    await writeState(db);
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
