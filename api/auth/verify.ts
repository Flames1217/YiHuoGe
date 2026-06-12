import type { VercelRequest, VercelResponse } from "@vercel/node";

const adminKey = process.env.YIHUOGE_ADMIN_KEY ?? "";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  const headerKey = req.headers["x-admin-key"];
  const bearer = req.headers.authorization;
  const key = Array.isArray(headerKey) ? headerKey[0] : headerKey;
  if (!adminKey || key === adminKey || bearer === `Bearer ${adminKey}`) {
    res.status(200).json({ ok: true, protected: Boolean(adminKey) });
    return;
  }
  res.status(401).json({ ok: false, error: "invalid admin key" });
}
