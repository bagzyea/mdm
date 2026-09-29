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
] as const;

export type CommandType = (typeof AGENT_COMMANDS)[number];

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
