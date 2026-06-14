import { sendNotificationDispatch, type NotificationDispatchPayload } from "../../server/notify.js";

function hasValidAdminKey(req: any) {
  const adminKey = process.env.YIHUOGE_ADMIN_KEY ?? "";
  const headerKey = Array.isArray(req.headers["x-admin-key"]) ? req.headers["x-admin-key"][0] : req.headers["x-admin-key"];
  return !adminKey || headerKey === adminKey || req.headers.authorization === `Bearer ${adminKey}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  if (!hasValidAdminKey(req)) {
    res.status(401).json({ ok: false, error: "invalid admin key" });
    return;
  }
  try {
    const payload = req.body as NotificationDispatchPayload | undefined;
    if (!payload?.channel?.type || !payload?.asset?.id) {
      res.status(400).json({ ok: false, error: "缺少通知渠道或资产信息" });
      return;
    }
    const result = await sendNotificationDispatch(payload);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "通知发送失败" });
  }
}
