const sek = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 })

/** 3500 → "3 500 kr". Aldrig inledande nollor, alltid hela kronor. */
export const formatSek = (n: number) => `${sek.format(Math.round(Number.isFinite(n) ? n : 0))} kr`
