// Runs without a database: User.upsert is stubbed and token validation is
// replaced by a fixed registry, so only the authentication boundary itself
// is under test.
const validTokens: Record<string, { id: string; email: string }> = {
  'good-token': { id: '2f6b4d3e-1111-4222-8333-444455556666', email: 'a@example.invalid' },
};
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => validTokens[token] ? { data: { user: validTokens[token] }, error: null } : { data: { user: null }, error: { message: 'invalid' } },
    },
  }),
}));
const upsert = jest.fn(async (_values: unknown) => undefined);
jest.mock('../src/models', () => ({ User: { upsert: (values: unknown) => upsert(values) } }));

type Env = Record<string, string | undefined>;

async function run(headers: Record<string, string>, envOverrides: Env = {}) {
  const saved: Env = {};
  for (const [key, value] of Object.entries(envOverrides)) { saved[key] = process.env[key]; process.env[key] = value; }
  try {
    let middleware: any;
    jest.isolateModules(() => { middleware = require('../src/middleware/auth').authMiddleware; });
    const req: any = { headers };
    const next = jest.fn();
    await middleware(req, {}, next);
    return { req, error: next.mock.calls[0]?.[0] };
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

beforeEach(() => upsert.mockClear());

describe('authMiddleware', () => {
  it('rejects a request without a bearer token', async () => {
    const { error, req } = await run({});
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(req.authUser).toBeUndefined();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects an invalid or expired token', async () => {
    const { error } = await run({ authorization: 'Bearer nope' });
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('takes the current user from the validated token, never from the request', async () => {
    const { error, req } = await run({ authorization: 'Bearer good-token' });
    expect(error).toBeUndefined();
    expect(req.authUser).toEqual({ id: validTokens['good-token'].id, email: 'a@example.invalid' });
    expect(upsert).toHaveBeenCalledWith({ id: validTokens['good-token'].id, email: 'a@example.invalid' });
  });

  it('refuses to start with DEV_AUTH_BYPASS or a placeholder Supabase project in production', async () => {
    await expect(run({}, { NODE_ENV: 'production', DEV_AUTH_BYPASS: 'true', SUPABASE_URL: 'https://real.supabase.co' })).rejects.toThrow(/DEV_AUTH_BYPASS/);
    await expect(run({}, { NODE_ENV: 'production', DEV_AUTH_BYPASS: 'false', SUPABASE_URL: 'https://your-project.supabase.co' })).rejects.toThrow(/SUPABASE_URL/);
  });

  it('refuses to start in production without the CA that verifies the database certificate', async () => {
    await expect(run({}, { NODE_ENV: 'production', DEV_AUTH_BYPASS: 'false', SUPABASE_URL: 'https://real.supabase.co', DB_SSL_CA: '' })).rejects.toThrow(/DB_SSL_CA/);
  });

  it('requires a token in production even when a bypass is attempted at runtime', async () => {
    // env refuses the bypass flag at startup; this covers the middleware's own guard as well.
    const { error } = await run({}, { NODE_ENV: 'production', DEV_AUTH_BYPASS: 'false', SUPABASE_URL: 'https://real.supabase.co', DB_SSL_CA: 'test-ca' });
    expect(error).toMatchObject({ status: 401 });
  });

  it('never bypasses when DEV_AUTH_BYPASS is off, whatever the environment', async () => {
    for (const NODE_ENV of ['development', 'test']) {
      const { error } = await run({}, { NODE_ENV, DEV_AUTH_BYPASS: 'false' });
      expect(error).toMatchObject({ status: 401 });
    }
  });
});
