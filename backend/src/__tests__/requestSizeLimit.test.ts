/**
 * The global 10 MB request cap ran before the APK upload route's own 500 MB limit, so
 * no app over 10 MB could be added to the App Vault (found 12 Oct 2026 uploading the
 * 21 MB agent). Only that route is exempt; everything else keeps the cap.
 */

import express from 'express';
import request from 'supertest';

import { validateRequest } from '../middleware/auth';

const ELEVEN_MB = String(11 * 1024 * 1024);

function app() {
  const a = express();
  a.use(validateRequest);
  a.all('/{*rest}', (_req, res) => res.status(200).json({ ok: true }));
  return a;
}

describe('global request size cap', () => {
  it('lets a large APK upload through to the route, which enforces its own limit', async () => {
    const res = await request(app())
      .post('/api/apk-registry/upload')
      .set('Content-Length', ELEVEN_MB)
      .send('');
    expect(res.status).toBe(200);
  });

  it('still refuses a large request anywhere else', async () => {
    const res = await request(app())
      .post('/api/devices/enroll')
      .set('Content-Length', ELEVEN_MB)
      .send('');
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('ENTITY_TOO_LARGE');
  });

  it('does not exempt other methods on the upload path', async () => {
    const res = await request(app())
      .put('/api/apk-registry/upload')
      .set('Content-Length', ELEVEN_MB)
      .send('');
    expect(res.status).toBe(413);
  });
});
