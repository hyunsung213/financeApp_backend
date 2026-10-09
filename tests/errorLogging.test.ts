// Runs without a database. Startup failure runs the real server entry point in
// a child process; 500 logging runs the real error handler behind a tiny app.
import { spawnSync } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AddressInfo } from 'net';
import express from 'express';
import { DatabaseError } from 'sequelize';
import { app } from '../src/app';
import { errorHandler } from '../src/middleware/errors';
import { AppError } from '../src/utils/errors';
import { redact } from '../src/utils/logging';

const DB_PASSWORD = 'sentinelDbPassw0rd9f3';
const DATABASE_URL = `postgres://wallet_user:${DB_PASSWORD}@127.0.0.1:1/wallet`;
const SERVICE_KEY = 'sb_secret_sentinelServiceKey77';
const TOKEN = 'sentinel-access-token-5c1';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZW50aW5lbCJ9.c2VudGluZWwtc2lnbmF0dXJl';

describe('startup failure', () => {
  it('exits non-zero and logs the cause without the connection string or keys', () => {
    // An empty cwd keeps the developer's .env out of the child process.
    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), join(__dirname, '../src/server.ts')], {
      cwd: mkdtempSync(join(tmpdir(), 'wallet-startup-')),
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        PORT: '4199',
        DATABASE_URL,
        DB_SSL: 'false',
        SUPABASE_URL: 'https://example-ref.supabase.co',
        SUPABASE_ANON_KEY: 'sb_publishable_example',
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
        YOUTH_POLICY_API_KEY: 'placeholder-youth-key',
        POLICY_SYNC_SCHEDULER_ENABLED: 'false',
      },
      encoding: 'utf8',
      timeout: 30000,
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Wallet backend startup failed: SequelizeConnectionRefusedError [ECONNREFUSED]: connect ECONNREFUSED 127.0.0.1:1');
    expect(output).not.toContain('listening');
    for (const secret of [DB_PASSWORD, DATABASE_URL, SERVICE_KEY]) expect(output).not.toContain(secret);
  });
});

describe('unexpected 500 logging', () => {
  let logged: string[];
  let spy: jest.SpyInstance;
  beforeEach(() => {
    logged = [];
    spy = jest.spyOn(console, 'error').mockImplementation((line: unknown) => { logged.push(String(line)); });
  });
  afterEach(() => spy.mockRestore());

  async function call(target: express.Express, path: string, init: RequestInit) {
    const server = target.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, init);
      return { status: res.status, text: await res.text() };
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  function boomApp(error: unknown) {
    const boom = express();
    boom.use(express.json());
    boom.post('/api/boom/:id', () => { throw error; });
    boom.use(errorHandler);
    return boom;
  }

  const request = (body: string): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, cookie: 'session=sentinel-cookie' },
    body,
  });

  it('logs method, path and cause of a database failure, but no SQL, parameters, query, body or token', async () => {
    const pgError = Object.assign(new Error('invalid input syntax for type uuid: "sentinel-param-value"'), { code: '22P02', detail: 'sentinel-detail' });
    const error = new DatabaseError(pgError as any);
    Object.assign(error, { sql: 'SELECT * FROM "Transaction" WHERE "id" = $1', parameters: ['sentinel-bind-param'] });

    const res = await call(boomApp(error), '/api/boom/42?q=sentinel-query-value', request('{"memo":"sentinel-body-value"}'));

    expect(res.status).toBe(500);
    expect(JSON.parse(res.text)).toEqual({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(logged).toHaveLength(1);
    const [line] = logged;
    expect(line).toContain('Unexpected 500 POST /api/boom/42: SequelizeDatabaseError [22P02]: invalid input syntax for type uuid: "…"');
    expect(line).toMatch(/\n\s+at /);
    for (const leaked of ['sentinel-param-value', 'sentinel-detail', 'SELECT', 'sentinel-bind-param', 'sentinel-query-value', 'sentinel-body-value', TOKEN, 'sentinel-cookie', '?q=']) {
      expect(line).not.toContain(leaked);
    }
  });

  it('keeps a malformed JSON body out of the log (the parser quotes it in its message)', async () => {
    const res = await call(app, '/api/transactions?q=sentinel-query-value', request('{"memo": sentinel-body-value'));

    expect(res.status).toBe(500);
    expect(JSON.parse(res.text)).toEqual({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('Unexpected 500 POST /api/transactions: SyntaxError: request body rejected (entity.parse.failed)');
    for (const leaked of ['sentinel-body-value', 'sentinel-query-value', TOKEN]) expect(logged[0]).not.toContain(leaked);
  });

  it('does not log expected 4xx errors', async () => {
    expect((await call(boomApp(new AppError('VALIDATION_ERROR', 'bad input', 400)), '/api/boom/1', request('{}'))).status).toBe(400);
    expect((await call(app, '/api/home', { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(401);
    expect((await call(app, '/api/nowhere', {})).status).toBe(404);
    expect(logged).toEqual([]);
  });
});

describe('redact', () => {
  it('scrubs configured secrets, credentials in URLs, bearer tokens and JWTs', () => {
    const saved = { DATABASE_URL: process.env.DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    try {
      const text = redact(`url=${DATABASE_URL} pw=${DB_PASSWORD} key=${SERVICE_KEY} other=postgresql://u:pw-x@db.example:5432/x auth=Bearer ${TOKEN} jwt=${JWT}`);
      for (const secret of [DATABASE_URL, DB_PASSWORD, SERVICE_KEY, 'pw-x', TOKEN, JWT]) expect(text).not.toContain(secret);
      expect(text).toContain('postgresql://[redacted]@db.example:5432/x');
    } finally {
      for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
});
