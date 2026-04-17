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

export type CommandType =
  | 'LOCK_DEVICE'
  | 'UNLOCK_DEVICE'
  | 'WIPE_DEVICE'
  | 'RESTART_DEVICE'
  | 'INSTALL_APP'
  | 'UNINSTALL_APP'
  | 'UPDATE_POLICY'
  | 'SET_KIOSK_MODE'
  | 'EXIT_KIOSK_MODE'
  | 'ENFORCE_ENCRYPTION'
  | 'DETECT_ROOT_STATUS';

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
