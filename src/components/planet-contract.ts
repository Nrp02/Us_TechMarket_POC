// What the planet's render and its stage agree on with the stylesheet: the
// breakpoints that decide whether a device has a planet at all, and the CSS
// custom properties the code reads. globals.css declares them; the test in
// this folder holds both sides to it. The planet's own breakpoint is CSS-only.

export const DESKTOP_MQ = "(hover: hover) and (pointer: fine) and (min-width: 1024px)";

export const PLANET_VARS = [
  "--camera-duration",
  "--camera-ease",
  "--color-backdrop",
  "--color-primary",
  "--saturn-bare",
  "--saturn-cream",
  "--saturn-glass",
  "--saturn-glow",
  "--saturn-gold",
  "--saturn-grey",
  "--saturn-opacity",
  "--saturn-pane",
  "--saturn-ring",
  "--saturn-ring-cool",
  "--saturn-roll",
  "--saturn-scale",
  "--saturn-tan",
  "--saturn-tilt",
] as const;
