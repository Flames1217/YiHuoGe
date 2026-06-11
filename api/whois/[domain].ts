const known: Record<string, any> = {
  "yihuoge.dev": {
    name: "yihuoge.dev",
    registrar: "\u706b\u7f51\u6ce8\u518c\u5c40",
    createdAt: "2024-07-18",
    expiresAt: "2026-07-18",
    dns: ["aria.ns.cloudflare.com", "dax.ns.cloudflare.com"],
    whoisStatus: ["clientTransferProhibited", "autoRenewPeriod"]
  }
};

export default function handler(req: any, res: any) {
  const domain = String(req.query.domain ?? "").toLowerCase();
  res.status(200).json(known[domain] ?? {
    name: domain,
    registrar: "WHOIS \u9002\u914d\u5668\u5f85\u914d\u7f6e",
    createdAt: "",
    expiresAt: "",
    dns: [],
    whoisStatus: ["lookup-adapter-not-configured"],
    note: "\u63a5\u5165 RDAP\u3001whois-json \u6216\u6ce8\u518c\u5546 API \u540e\u53ef\u8fd4\u56de\u771f\u5b9e\u5230\u671f\u65e5\u3002"
  });
}
