import { fetchProviderModels } from "../../_aiModels.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const adminKey = process.env.YIHUOGE_ADMIN_KEY ?? "";
  if (adminKey && req.headers["x-admin-key"] !== adminKey && req.headers.authorization !== `Bearer ${adminKey}`) {
    res.status(401).json({ error: "invalid admin key" });
    return;
  }

  try {
    const baseUrl = String(req.body?.baseUrl ?? "");
    const apiKey = String(req.body?.apiKey ?? "");
    const result = await fetchProviderModels(baseUrl, apiKey);
    res.status(200).json({ models: result.models, source: "provider", endpoint: result.endpoint });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "模型列表召回失败" });
  }
}
