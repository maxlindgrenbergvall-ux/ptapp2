import "server-only"

import dns from "node:dns/promises"

/**
 * MX-kontroll (v47): tar e-postdomänen emot post? En adress på en domän utan
 * postserver studsar garanterat – och studsar skadar avsändarens rykte.
 *
 *   true  – domänen har MX-poster
 *   false – domänen finns inte, eller säger uttryckligen att den inte tar emot post (null MX)
 *   null  – gick inte att avgöra just nu (tidsgräns, DNS-fel) – ingen dom fälls
 *
 * Kontrollen säger inget om att just den brevlådan finns; det går inte att veta
 * utan att skicka. Inga anslutningar görs till mottagarens postserver.
 *
 * Tester: CRM_MX_MOCK="elinpt.se,sats.se" → de domänerna räknas som giltiga, alla
 * andra som ogiltiga, och ingen DNS-fråga ställs.
 */
const cache = new Map<string, { value: boolean | null; at: number }>()

export async function hasMx(email: string): Promise<boolean | null> {
  const domain = email.split("@")[1]?.toLowerCase().trim()
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,24}$/.test(domain)) return false
  const mock = process.env.CRM_MX_MOCK
  if (mock !== undefined) return mock.split(",").map((d) => d.trim().toLowerCase()).includes(domain)
  const hit = cache.get(domain)
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.value
  let value: boolean | null
  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), 4000)),
    ])
    // "Null MX" (RFC 7505): en enda post med tom värd = tar uttryckligen inte emot post.
    value = records.some((r) => r.exchange && r.exchange !== ".")
  } catch (e) {
    const code = (e as { code?: string }).code
    value = code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN" ? false : null
  }
  if (cache.size > 2000) cache.clear()
  cache.set(domain, { value, at: Date.now() })
  return value
}
