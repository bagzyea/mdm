/**
 * Status palette for fleet visualisations.
 *
 * These four values are not a matter of taste — they were selected by running the
 * palette validator (lightness band, chroma floor, CVD separation, normal-vision
 * floor, contrast vs surface) against the dashboard's own white chart surface, and
 * they are the first combination that passes every check:
 *
 *   good #00897b · warning #c8860d · critical #d03b3b   on #ffffff
 *     [PASS] Lightness band      all 3 inside L 0.43–0.77
 *     [PASS] Chroma floor        all 3 >= 0.1
 *     [PASS] CVD separation      worst adjacent ΔE 10.2 (deutan) · tritan 14.2
 *     [PASS] Normal-vision floor worst adjacent ΔE 17.0
 *     [PASS] Contrast vs surface all 3 >= 3:1
 *
 * Two findings worth keeping, because they constrain future edits:
 *
 * 1. The conventional green/amber pairing FAILS. A mid-dark amber and a mid-dark
 *    green converge under protan/deutan simulation (ΔE 1.5–2.8) — a red-green
 *    colourblind operator cannot tell "healthy" from "warning". `good` is therefore
 *    a teal, not a green. Do not "fix" it back to green.
 *
 * 2. `warning` and `serious` (the amber/orange pair) sit ΔE 13.6 apart under normal
 *    vision — below the 15 floor. They must never be adjacent segments of the same
 *    bar. `serious` is used only in its own separate meter track, never beside
 *    `warning` on a shared scale.
 *
 * Contrast clears 3:1, but every status colour still ships with an icon and a text
 * label — state is never carried by hue alone.
 *
 * Re-run before changing any value:
 *   node validate_palette.js "#00897b,#c8860d,#d03b3b" --mode light --surface "#ffffff"
 */
export const statusPalette = {
  /** Reachable, healthy, succeeded. */
  good: '#00897b',
  /** Degraded but not failing — needs attention soon. */
  warning: '#c8860d',
  /** Failing, suspended, or unreachable. */
  critical: '#d03b3b',
  /** Unknown / not-applicable. Deliberately below the chroma floor: it is the
   *  de-emphasis colour, not a series, and must read as grey. */
  neutral: '#8a8a85',
} as const;

export type StatusTone = keyof typeof statusPalette;

/** Track colour behind a meter or stacked bar. Recessive by design. */
export const trackColor = 'rgba(0, 0, 0, 0.07)';
