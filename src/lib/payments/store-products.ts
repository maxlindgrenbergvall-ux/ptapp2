/**
 * Köp i appen (App Store via RevenueCat). Produkterna skapas i App Store
 * Connect och importeras i RevenueCat – id:na måste stämma exakt.
 *
 *   Coavira Plus  – prenumeration, förnyas automatiskt: 49 kr/mån, 499 kr/år
 *   PT Boost      – engångsköp (icke-förnyande): 199 kr för 7 dagar
 *
 * Priserna visas alltid från butiken (rätt valuta och moms); siffrorna här
 * används bara som reserv om butiken inte svarar.
 */
export const PLUS_ENTITLEMENT = "plus"
export const PLUS_MONTHLY = "coavira_plus_monthly"
export const PLUS_YEARLY = "coavira_plus_yearly"
export const PLUS_PRODUCTS = [PLUS_MONTHLY, PLUS_YEARLY] as const
export const BOOST_PRODUCT = "coavira_pt_boost_7d"
export const BOOST_PRODUCT_DAYS = 7

export const FALLBACK_PRICE: Record<string, string> = {
  [PLUS_MONTHLY]: "49 kr",
  [PLUS_YEARLY]: "499 kr",
  [BOOST_PRODUCT]: "199 kr",
}

export const isPlusProduct = (id: string | null | undefined) => (PLUS_PRODUCTS as readonly string[]).includes(id ?? "")

/** Apples sida för att hantera eller säga upp prenumerationer. */
export const APPLE_MANAGE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions"
