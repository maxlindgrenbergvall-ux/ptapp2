/**
 * Stäng-/kryssknappar: minst 44 × 44 px (Apples Human Interface Guidelines),
 * rund och med lätt, halvgenomskinlig bakgrund så att krysset syns mot alla
 * bakgrunder i både ljust och mörkt läge.
 */
export const CLOSE_BUTTON =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-muted/80 text-foreground backdrop-blur-sm transition-colors hover:bg-muted active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0"
