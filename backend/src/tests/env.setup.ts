/**
 * Environment for tests, applied before any module is loaded.
 *
 * src/config/env.ts validates required secrets at import time and refuses to start
 * without them (finding F-04), so every suite that transitively imports it needs a
 * secret that satisfies the 32-byte minimum.
 *
 * This file deliberately sets environment variables only. src/tests/setup.ts also
 * installs a global PrismaClient mock, which conflicts with the per-suite mocks the
 * controller tests set up, so it is not wired into the jest config.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-value-of-at-least-32-bytes';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-of-at-least-32-bytes';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';

export {};
