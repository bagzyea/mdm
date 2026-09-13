/**
 * Terminal error and 404 handling (finding F-24).
 *
 * Express had no terminal error middleware, so a thrown async error in any handler hung
 * the request until the client timed out, with nothing logged. There was no 404 handler
 * either, so unknown paths fell through to Express's HTML default.
 */

import express from 'express';
import request from 'supertest';

import { errorHandler, notFoundHandler, HttpError, asyncHandler } from '../middleware/errorHandler';

jest.mock('../logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), fatal: jest.fn() },
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), fatal: jest.fn() },
}));

function buildApp(mount: (app: express.Express) => void) {
  const app = express();
  app.use(express.json());
  mount(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('404 handling', () => {
  it('answers an unknown path with JSON, not HTML', async () => {
    const app = buildApp((a) => a.get('/known', (_req, res) => res.json({ ok: true })));

    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.type).toBe('application/json');
    expect(res.body).toEqual(
      expect.objectContaining({ error: 'Not found', code: 'NOT_FOUND', path: '/does-not-exist' })
    );
  });

  it('does not intercept a route that does exist', async () => {
    const app = buildApp((a) => a.get('/known', (_req, res) => res.json({ ok: true })));

    const res = await request(app).get('/known');
    expect(res.status).toBe(200);
  });

  it('reports the method as well as the path', async () => {
    const app = buildApp((a) => a.get('/known', (_req, res) => res.json({ ok: true })));

    const res = await request(app).delete('/known');
    expect(res.body).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('error handling', () => {
  it('answers a synchronous throw with 500 rather than hanging', async () => {
    const app = buildApp((a) =>
      a.get('/boom', () => {
        throw new Error('database connection lost');
      })
    );

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('answers a rejected async handler with 500 rather than hanging', async () => {
    // This is the case that used to hang: Express 4 did not forward async rejections.
    const app = buildApp((a) =>
      a.get('/boom', async () => {
        throw new Error('async failure');
      })
    );

    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
  });

  it('honours the status on an HttpError', async () => {
    const app = buildApp((a) =>
      a.get('/conflict', () => {
        throw new HttpError('Device already retired', 409, 'ALREADY_RETIRED');
      })
    );

    const res = await request(app).get('/conflict');

    expect(res.status).toBe(409);
    expect(res.body).toEqual(
      expect.objectContaining({ error: 'Device already retired', code: 'ALREADY_RETIRED' })
    );
  });

  it('withholds the internal message on a 500', async () => {
    const app = buildApp((a) =>
      a.get('/boom', () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      })
    );

    const res = await request(app).get('/boom');

    // The generic text is what the client sees; the detail goes to the log.
    expect(res.body.error).toBe('Internal server error');
  });

  it('does not leak a stack trace in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const app = buildApp((a) =>
        a.get('/boom', () => {
          throw new Error('internal detail');
        })
      );

      const res = await request(app).get('/boom');

      expect(res.body.stack).toBeUndefined();
      expect(res.body.message).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('internal detail');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('includes the stack outside production, where it is useful', async () => {
    const app = buildApp((a) =>
      a.get('/boom', () => {
        throw new Error('internal detail');
      })
    );

    const res = await request(app).get('/boom');
    expect(res.body.stack).toEqual(expect.any(String));
  });

  it('asyncHandler forwards a rejection to the handler', async () => {
    const app = buildApp((a) =>
      a.get(
        '/boom',
        asyncHandler(async () => {
          throw new HttpError('not found', 404, 'GONE');
        })
      )
    );

    const res = await request(app).get('/boom');
    expect(res.status).toBe(404);
  });

  it('keeps its four-parameter arity, which Express uses to identify it', () => {
    // Dropping the unused `next` would silently turn this into ordinary middleware and
    // disable error handling entirely.
    expect(errorHandler.length).toBe(4);
  });
});
