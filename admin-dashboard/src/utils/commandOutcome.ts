/**
 * What to tell an operator after sending a command.
 *
 * Most tablets are offline most of the time, so "sent" is the exception: a command
 * usually waits on the server until the tablet next checks in, and gives up when it
 * expires. The dashboard used to say nothing at all after a command; these messages say
 * which of the two happened and what to expect.
 */

import { formatLastSeen, formatShortDate } from './deviceDisplay';

interface CommandRow {
  status: string;
}

/** Response of POST /api/devices/:deviceId/command. */
export interface SingleCommandResponse extends CommandRow {
  expiresAt?: string;
}

/** Response of POST /api/commands. */
export interface BulkCommandResponse {
  commands?: CommandRow[];
  devicesSkipped?: string[];
  expiresAt?: string;
}

export interface CommandOutcomeMessage {
  severity: 'success' | 'info' | 'warning';
  message: string;
}

const expiryClause = (expiresAt?: string) =>
  expiresAt ? `; it is cancelled if not collected by ${formatShortDate(expiresAt)}` : '';

export function describeSingleCommand(
  commandLabel: string,
  deviceName: string,
  lastSeen: string | null | undefined,
  response: SingleCommandResponse
): CommandOutcomeMessage {
  if (response.status === 'SENT') {
    return {
      severity: 'success',
      message: `${commandLabel} sent to ${deviceName}. Its result will appear in Commands.`,
    };
  }
  const seen = formatLastSeen(lastSeen);
  const seenClause = seen === 'Never' ? 'has never checked in' : `was last seen ${seen}`;
  return {
    severity: 'info',
    message:
      `${commandLabel} queued for ${deviceName}, which ${seenClause}. ` +
      `It runs when the tablet reconnects${expiryClause(response.expiresAt)}.`,
  };
}

const tablets = (n: number) => `${n} tablet${n === 1 ? '' : 's'}`;

export function describeBulkCommand(commandLabel: string, response: BulkCommandResponse): CommandOutcomeMessage {
  const rows = response.commands ?? [];
  const sent = rows.filter((c) => c.status === 'SENT').length;
  const queued = rows.length - sent;
  const skipped = response.devicesSkipped?.length ?? 0;

  const parts: string[] = [];
  if (sent > 0) parts.push(`sent to ${tablets(sent)} now`);
  if (queued > 0) {
    parts.push(`queued for ${tablets(queued)} until they reconnect${expiryClause(response.expiresAt)}`);
  }
  let message = `${commandLabel} ${parts.join(', ')}.`;
  if (skipped > 0) message += ` ${tablets(skipped)} skipped: suspended, revoked or retired.`;

  return { severity: skipped > 0 ? 'warning' : queued > 0 ? 'info' : 'success', message };
}
