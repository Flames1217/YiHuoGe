import { readState } from "../_state.js";
import { lookupDomainRdap } from "../../server/rdap.js";

function cachedRegistrarUsable(registrar?: string) {
  const value = registrar?.trim().toLowerCase();
  return Boolean(value && !["自定义", "rdap registrar", "rdap lookup failed"].includes(value));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const requestedDomain = String(req.query?.domain ?? "").toLowerCase();
  if (!requestedDomain) {
    res.status(400).json({ error: "domain is required" });
    return;
  }

  const db = await readState() as any;
  const found = Array.isArray(db.domains)
    ? db.domains.find((domain: any) => String(domain.name ?? "").toLowerCase() === requestedDomain)
    : undefined;
  if (found?.expiresAt && cachedRegistrarUsable(found.registrar)) {
    res.status(200).json(found);
    return;
  }

  try {
    res.status(200).json(await lookupDomainRdap(requestedDomain));
  } catch (error) {
    res.status(502).json({
      name: requestedDomain,
      registrar: "RDAP lookup failed",
      createdAt: "",
      expiresAt: "",
      dns: [],
      whoisStatus: ["rdap-lookup-failed"],
      error: error instanceof Error ? error.message : "RDAP lookup failed",
    });
  }
}
