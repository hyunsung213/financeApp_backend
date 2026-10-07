import { randomUUID } from 'crypto';
import type { AddressInfo } from 'net';
import { Op } from 'sequelize';

// Supabase token validation is replaced by a registry of test tokens: the
// Express app, auth middleware, routes, validation and ownership checks all
// run for real against DATABASE_URL (opt-in with RUN_DB_TESTS=1).
const mockTokens = new Map<string, { id: string; email: string }>();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => {
        const user = mockTokens.get(token);
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid token' } };
      },
    },
  }),
}));

import { app } from '../../src/app';
import { BudgetCycle, BudgetCycleAllocation, User } from '../../src/models';

export type TestUser = { id: string; email: string; token: string };

export function registerUser(label: string): TestUser {
  const id = randomUUID();
  const email = `${label}-${id}@example.invalid`;
  const token = `token-${label}-${id}`;
  mockTokens.set(token, { id, email });
  return { id, email, token };
}

export async function startServer() {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', connection: 'close', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json, data: json?.data, error: json?.error };
  };
  const close = () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return { base, call, close };
}

// BudgetCycleAllocation -> BudgetAllocation does not cascade, so snapshots
// go first; the user's delete cascades to everything else.
export async function deleteUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  const cycles = await BudgetCycle.findAll({ where: { userId: { [Op.in]: userIds } }, attributes: ['id'] });
  await BudgetCycleAllocation.destroy({ where: { budgetCycleId: { [Op.in]: cycles.map((cycle: any) => cycle.id) } } });
  await User.destroy({ where: { id: { [Op.in]: userIds } } });
}
