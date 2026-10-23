/**
 * How device values are shown when they may be missing.
 *
 * The device list used to fill gaps with plausible values: a device with no last-seen
 * time showed "Just now" and an unknown battery showed a red 0%. In a fleet that is
 * mostly offline those are the worst possible mistakes, so a missing value is shown as
 * missing.
 */

export const UNKNOWN = '—';

/** "Just now", "12m ago", "5h ago", "3d ago", or "Never" when there is no time at all. */
export function formatLastSeen(lastSeen: string | null | undefined, now: Date = new Date()): string {
  if (!lastSeen) return 'Never';
  const then = new Date(lastSeen);
  if (Number.isNaN(then.getTime())) return UNKNOWN;

  const diffMins = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 60000));
  if (diffMins < 5) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

/** A battery percentage, or the unknown marker. 0 is a real reading, not a missing one. */
export function formatBattery(level: number | null | undefined): string {
  return typeof level === 'number' ? `${level}%` : UNKNOWN;
}

/** A short date for messages, such as "22 Oct". */
export function formatShortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
