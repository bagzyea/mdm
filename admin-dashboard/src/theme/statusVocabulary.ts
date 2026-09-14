import { StatusTone } from './statusPalette';

/**
 * One mapping from a domain status to a visual tone, for the whole dashboard.
 *
 * Before this existed there were four separate `getStatusColor` functions — in
 * DevicesPage, DeviceRetirementPage, and twice in MapViewPage — and they disagreed:
 *
 *   - `WIPED` was red on the map and grey (unhandled, fell to `default`) on the device
 *     list, so an operator reading the device list could not see that a device had been
 *     wiped.
 *   - `ENROLLED` was green on the map and grey on the device list.
 *   - DevicesPage handled a `LOST` status that does not exist in the schema, and did not
 *     handle `WIPED`, which does.
 *
 * Those are correctness bugs, not styling preferences. Statuses are added here, once.
 *
 * Tone meanings — the question each answers is "does an operator need to do something?":
 *   good      settled and healthy; no action
 *   info      underway; no action yet, but it is not finished
 *   warning   needs attention soon, or is waiting on a human
 *   critical  failed, or the device is not usable
 *   neutral   inert, unknown, or deliberately ended
 */
const TONES: Record<string, StatusTone> = {
  // --- Device ---
  ACTIVE: 'good',
  ENROLLED: 'good',
  INACTIVE: 'neutral',
  SUSPENDED: 'warning',
  WIPED: 'critical',

  // --- Remote command ---
  PENDING: 'warning',
  SENT: 'info',
  EXECUTED: 'good',
  FAILED: 'critical',
  CANCELLED: 'neutral',

  // --- Provisioning session & per-device progress ---
  NOT_PROVISIONED: 'neutral',
  IN_PROGRESS: 'info',
  DOWNLOADING_APPS: 'info',
  INSTALLING_APPS: 'info',
  CONFIGURING_NETWORK: 'info',
  CONFIGURING_SECURITY: 'info',
  DEPLOYING_FILES: 'info',
  VALIDATING: 'info',
  COMPLETED: 'good',
  PAUSED: 'warning',

  // --- Transfer ---
  APPROVED: 'info',
  REJECTED: 'critical',

  // --- Retirement ---
  INITIATED: 'info',
  DATA_WIPE_PENDING: 'warning',
  DATA_WIPED: 'info',
  PHYSICAL_RETURN_PENDING: 'warning',
  PHYSICAL_RETURNED: 'info',
  DISPOSED: 'good',

  // --- Compliance ---
  COMPLIANT: 'good',
  NON_COMPLIANT: 'critical',
  PARTIALLY_COMPLIANT: 'warning',
  UNKNOWN: 'neutral',

  // --- Certificate ---
  EXPIRED: 'critical',
  REVOKED: 'critical',

  // --- Quality control ---
  PASSED: 'good',
  WARNING: 'warning',
};

/**
 * Visual tone for a status. Unknown statuses are neutral rather than guessed — a status
 * nobody mapped should read as "we do not know", not as "fine".
 */
export const statusTone = (status: string | null | undefined): StatusTone =>
  (status && TONES[status.toUpperCase()]) || 'neutral';

/** True when the status has an explicit mapping, for tests and dev warnings. */
export const isKnownStatus = (status: string): boolean =>
  Object.prototype.hasOwnProperty.call(TONES, status.toUpperCase());

/** Every status this vocabulary knows. Used by the vocabulary test. */
export const knownStatuses = (): string[] => Object.keys(TONES);

/**
 * SCREAMING_SNAKE_CASE to something a person reads: `DATA_WIPE_PENDING` -> `Data wipe
 * pending`. Operator-facing text should not look like a database column.
 */
export const statusLabel = (status: string | null | undefined): string => {
  if (!status) return 'Unknown';
  const words = status.replace(/_/g, ' ').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
