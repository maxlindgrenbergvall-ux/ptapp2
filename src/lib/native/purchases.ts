"use client"

/**
 * Köp i iPhone-appen via App Store (RevenueCat). Används bara i iOS-appen –
 * på webben betalas Plus och Boost med Stripe, och i Android-appen visas de
 * inte förrän Google Play Billing är på plats.
 *
 * Köpet görs av Apple. Efteråt ber appen servern att hämta köpet från
 * RevenueCat (/api/revenuecat/sync), som uppdaterar Plus/Boost i databasen.
 * RevenueCats webhook gör samma sak för förnyelser och återbetalningar.
 */
import type { PurchasesPackage, PurchasesStoreProduct } from "@revenuecat/purchases-capacitor"

import { nativePlatform } from "@/lib/native/app"
import { APPLE_MANAGE_SUBSCRIPTIONS_URL, BOOST_PRODUCT, PLUS_MONTHLY, PLUS_YEARLY } from "@/lib/payments/store-products"

/** Den publika iOS-nyckeln från RevenueCat (appl_…). Får finnas i appen. */
const IOS_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY?.trim() ?? ""

export type PurchaseMode = "stripe" | "store" | "none"

/**
 * Hur Plus och Boost köps här:
 *  - webben: Stripe
 *  - iOS-appen: App Store (om RevenueCat är konfigurerat, annars inte alls)
 *  - Android-appen: inte alls än (Google kräver Google Play Billing)
 */
export function purchaseMode(): PurchaseMode {
  const platform = nativePlatform()
  if (!platform) return "stripe"
  if (platform === "ios" && IOS_KEY.startsWith("appl_")) return "store"
  return "none"
}

export interface StoreOption {
  id: string
  kind: "monthly" | "yearly" | "boost"
  priceString: string
  title: string
  /** RevenueCat-objektet som köps. */
  pkg?: PurchasesPackage
  product?: PurchasesStoreProduct
}

export class PurchaseCancelled extends Error {}

const plugin = () => import("@revenuecat/purchases-capacitor").then((m) => m.Purchases)

let configuredFor: string | null = null
/** Konfigurera RevenueCat för den inloggade (Supabase-id = RevenueCats app user id). */
async function ready(userId: string) {
  const Purchases = await plugin()
  if (configuredFor === userId) return Purchases
  const { isConfigured } = await Purchases.isConfigured()
  if (!isConfigured) await Purchases.configure({ apiKey: IOS_KEY, appUserID: userId })
  else await Purchases.logIn({ appUserID: userId })
  configuredFor = userId
  return Purchases
}

/** Plus månad/år ur standarderbjudandet ("default" i RevenueCat). */
export async function loadPlusOptions(userId: string): Promise<StoreOption[]> {
  const Purchases = await ready(userId)
  const offerings = await Purchases.getOfferings()
  const pkgs = offerings.current?.availablePackages ?? []
  const out: StoreOption[] = []
  for (const pkg of pkgs) {
    const id = pkg.product.identifier
    if (id === PLUS_MONTHLY || id === PLUS_YEARLY) {
      out.push({ id, kind: id === PLUS_MONTHLY ? "monthly" : "yearly", priceString: pkg.product.priceString, title: pkg.product.title, pkg })
    }
  }
  return out.sort((a) => (a.kind === "monthly" ? -1 : 1))
}

export async function loadBoostOption(userId: string): Promise<StoreOption | null> {
  const Purchases = await ready(userId)
  const { products } = await Purchases.getProducts({ productIdentifiers: [BOOST_PRODUCT] })
  const product = products.find((p) => p.identifier === BOOST_PRODUCT)
  return product ? { id: BOOST_PRODUCT, kind: "boost", priceString: product.priceString, title: product.title, product } : null
}

/** Köp hos Apple. Kastar PurchaseCancelled om användaren avbryter. */
export async function buyOption(userId: string, option: StoreOption) {
  const Purchases = await ready(userId)
  try {
    if (option.pkg) await Purchases.purchasePackage({ aPackage: option.pkg })
    else if (option.product) await Purchases.purchaseStoreProduct({ product: option.product })
    else throw new Error("Produkten finns inte i App Store just nu.")
  } catch (e) {
    if ((e as { userCancelled?: boolean } | null)?.userCancelled || (e as { code?: string | number } | null)?.code === "1") throw new PurchaseCancelled()
    throw e
  }
}

/** "Återställ köp" (krävs av Apple). */
export async function restoreStorePurchases(userId: string) {
  const Purchases = await ready(userId)
  await Purchases.restorePurchases()
}

/** Hantera eller säga upp prenumerationen hos Apple. */
export async function openManageSubscriptions(userId: string) {
  let url = APPLE_MANAGE_SUBSCRIPTIONS_URL
  try {
    const Purchases = await ready(userId)
    url = (await Purchases.getCustomerInfo()).customerInfo.managementURL ?? url
  } catch {}
  const { Browser } = await import("@capacitor/browser")
  await Browser.open({ url })
}

/** Glöm användaren vid utloggning (nästa konto på enheten får inte dennes köp). */
export async function logOutStore() {
  if (purchaseMode() !== "store" || !configuredFor) return
  try {
    const Purchases = await plugin()
    await Purchases.logOut()
  } catch {}
  configuredFor = null
}
