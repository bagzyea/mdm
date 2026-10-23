export interface CommandResponse {
  commandId: string;
  deviceId: string;
  result: {
    success: boolean;
    message?: string;
    data?: unknown;
    timestamp?: Date;
  };
}

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
  timestamp: Date;
}

/**
 * Every command the Android agent executes — the single command vocabulary.
 *
 * Five lists had drifted apart: this file (11 names), the backend's own type (22), the
 * backend's request schema, the dashboard, and the agent's `CommandExecutor` (14,
 * counting aliases). The backend sent WIPE_DEVICE, INSTALL_APP, GRANT_PERMISSIONS,
 * ENFORCE_ENCRYPTION and DETECT_ROOT_STATUS, and the agent rejected every one of them as
 * "Unknown command type" — after the operator had been told the command was sent.
 *
 * This list is what the agent actually handles. `commandContract.test.ts` in the backend
 * parses `CommandExecutor.kt` and fails if the two diverge, and the backend refuses to
 * queue anything not listed here. Adding a command means implementing it in the agent
 * first.
 */
export const AGENT_COMMANDS = [
  'LOCK_DEVICE',
  'UNLOCK_DEVICE',
  'ENABLE_KIOSK',
  'SET_KIOSK_MODE',
  'DISABLE_KIOSK',
  'EXIT_KIOSK_MODE',
  'GET_DEVICE_INFO',
  'LOCATE_DEVICE',
  'APPLY_POLICY',
  'UPDATE_POLICY',
  'REMOVE_POLICY',
  'SYNC_SETTINGS',
  'RESTART_SERVICES',
  'PROVISION_DEVICE',
  'APPLY_FIELD_CONFIGURATION',
  'RECLAIM_DEVICE',
] as const;

export type CommandType = (typeof AGENT_COMMANDS)[number];

/**
 * Commands that erase a tablet. The server queues them only for users who may delete
 * devices, and only with `parameters.confirmCount` equal to the number of tablets it
 * will reach, so a mistyped device list or a stray API call cannot erase the fleet.
 *
 * RECLAIM_DEVICE factory-resets the tablet and clears Factory Reset Protection, so it
 * comes back without asking for whichever Google account was last on it. Device Owner
 * only; a Device Admin agent refuses it.
 */
export const DESTRUCTIVE_COMMANDS: readonly CommandType[] = ['RECLAIM_DEVICE'];

export function isDestructiveCommand(value: unknown): boolean {
  return typeof value === 'string' && (DESTRUCTIVE_COMMANDS as readonly string[]).includes(value);
}

export function isAgentCommand(value: unknown): value is CommandType {
  return typeof value === 'string' && (AGENT_COMMANDS as readonly string[]).includes(value);
}

export interface Command {
  id: string;
  deviceId: string;
  command: CommandType;
  parameters?: Record<string, unknown>;
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
  updatedAt: Date;
  executedAt?: Date;
}
