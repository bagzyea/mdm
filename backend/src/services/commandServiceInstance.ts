import { CommandService } from './commandService';
import { Server as SocketIOServer } from 'socket.io';

let commandServiceInstance: CommandService | null = null;

export function initializeCommandService(io: SocketIOServer) {
  commandServiceInstance = new CommandService(io);
  return commandServiceInstance;
}

export function getCommandService(): CommandService {
  if (!commandServiceInstance) {
    throw new Error('CommandService not initialized');
  }
  return commandServiceInstance;
}
