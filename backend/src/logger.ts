import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * `transport: undefined` is not the same as an absent `transport` under
 * exactOptionalPropertyTypes — pino's own types reject the former — so the key is
 * spread in only when a pretty transport is actually wanted.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        },
      }
    : {}),
});

export default logger;
