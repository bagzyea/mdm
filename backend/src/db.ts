import { PrismaClient } from '@prisma/client';

/**
 * The process-wide Prisma client (finding F-24).
 *
 * Seventeen modules each constructed their own `new PrismaClient()`, so a single server
 * process opened seventeen independent connection pools. With Prisma's default pool size
 * that is far more Postgres connections than intended, and it makes the real limit
 * impossible to reason about — the fleet-scale work in Phase 3 would have hit it first.
 *
 * A single instance also gives shutdown one thing to close, which `closeDatabase()`
 * below does on SIGTERM so a rolling deploy drains rather than dropping queries.
 */

declare global {
  // eslint-disable-next-line no-var
  var __mdmPrisma: PrismaClient | undefined;
}

/**
 * Reused across module reloads. `nodemon` and `ts-jest` re-evaluate modules freely, and
 * without this each reload would leak another pool.
 */
export const prisma: PrismaClient =
  global.__mdmPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__mdmPrisma = prisma;
}

export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
