const localModels = ["gpt-4.1", "gpt-4.1-mini", "o4-mini", "deepseek-chat"];

function checkAdmin(req: any, res: any) {
  const adminKey = process.env.YIHUOGE_ADMIN_KEY ?? "";
  if (!adminKey) return true;
  if (req.headers["x-admin-key"] === adminKey || req.headers.authorization === `Bearer ${adminKey}`) return true;
  res.status(401).json({ error: "invalid admin key" });
  return false;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!checkAdmin(req, res)) return;
  const baseUrl = String(req.body?.baseUrl ?? "").replace(/\/$/, "");
  const apiKey = String(req.body?.apiKey ?? "");
  if (!baseUrl) {
    res.status(200).json({ models: localModels, source: "local" });
    return;
  }
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
    if (!response.ok) throw new Error(`model endpoint ${response.status}`);
    const data = await response.json() as { data?: Array<{ id?: string }> };
    const models = (data.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
    res.status(200).json({ models: models.length ? models : localModels, source: "provider" });
  } catch {
    res.status(200).json({ models: localModels, source: "local" });
  }
}
