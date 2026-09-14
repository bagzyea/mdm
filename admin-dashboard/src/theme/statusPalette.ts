/**
 * Status palette for fleet visualisations.
 *
 * These four values are not a matter of taste — they were selected by running the
 * palette validator (lightness band, chroma floor, CVD separation, normal-vision
 * floor, contrast vs surface) against the dashboard's own white chart surface, and
 * they are the first combination that passes every check:
 *
 *   good #00897b · info #1f6feb · warning #c8860d · critical #d03b3b   on #ffffff
 *     [PASS] Lightness band      all 4 inside L 0.43–0.77
 *     [PASS] Chroma floor        all 4 >= 0.1
 *     [PASS] CVD separation      worst all-pairs ΔE 10.2 (deutan) · tritan 4.6
 *     [PASS] Normal-vision floor worst all-pairs ΔE 17.0
 *     [PASS] Contrast vs surface all 4 >= 3:1
 *
 * Checked with `--pairs all`, not just adjacent pairs: these tones appear as isolated
 * chips scattered down a table, so any two of them can end up side by side.
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
 *   node validate_palette.js "#00897b,#1f6feb,#c8860d,#d03b3b" \
 *     --mode light --surface "#ffffff" --pairs all
 */
export const statusPalette = {
  /** Reachable, healthy, succeeded. */
  good: '#00897b',
  /** Underway — accepted and progressing, no action needed yet. */
  info: '#1f6feb',
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
