import type { Server as SocketIOServer } from 'socket.io';

/**
 * The process's Socket.IO server, for code outside src/server.ts that must act on live
 * connections — for example disconnecting a device the moment an administrator
 * suspends it, rather than letting its socket run until the access token expires.
 */

let io: SocketIOServer | null = null;

export const deviceRoom = (deviceId: string): string => `device_${deviceId}`;

export function registerSocketServer(server: SocketIOServer): void {
  io = server;
}

/** Broadcast to connected dashboards only — never to device sockets. */
export function emitToAdmins(event: string, payload: unknown): void {
  io?.to('admins').emit(event, payload);
}

/** Tell a device why it is being dropped, then close all of its sockets. */
export function disconnectDevice(deviceId: string, reason: string): void {
  if (!io) return;
  io.to(deviceRoom(deviceId)).emit('authError', { message: reason });
  io.in(deviceRoom(deviceId)).disconnectSockets(true);
}

/** Whether the device still has at least one open socket. */
export async function isDeviceConnected(deviceId: string): Promise<boolean> {
  if (!io) return false;
  const sockets = await io.in(deviceRoom(deviceId)).fetchSockets();
  return sockets.length > 0;
}
