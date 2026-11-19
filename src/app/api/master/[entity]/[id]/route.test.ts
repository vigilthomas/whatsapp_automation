import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny recording stand-in for the Supabase query builder: every call is
// logged, and awaiting the chain (or .maybeSingle()) resolves `result`.
type Call = [string, ...unknown[]];
function builder(result: unknown, calls: Call[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'update', 'delete', 'eq', 'is']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
  return chain;
}

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  results: [] as unknown[],
  calls: [] as Call[][],
}));

vi.mock('@/lib/auth/permission-guard', () => ({ requirePermission: mocks.requirePermission }));
vi.mock('@/lib/auth/account', () => ({
  toErrorResponse: vi.fn(() => Response.json({ error: 'denied' }, { status: 403 })),
}));
vi.mock('@/lib/master/server', () => ({
  assertRefsInAccount: vi.fn(async () => null),
  // No data scope: the routes behave exactly as before for these tables.
  entityScope: vi.fn(async () => null),
}));
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const calls: Call[] = [['from', table]];
      mocks.calls.push(calls);
      return builder(mocks.results.shift(), calls);
    },
  }),
}));

import { DELETE, PATCH } from './route';
import { entityScope } from '@/lib/master/server';

const params = (entity: string) => ({ params: Promise.resolve({ entity, id: 'rec-1' }) });

beforeEach(() => {
  mocks.requirePermission.mockReset().mockResolvedValue({ accountId: 'acc-1' });
  mocks.results = [];
  mocks.calls = [];
});

describe('PATCH /api/master/[entity]/[id]', () => {
  it('needs Edit, and only touches a live row of this account', async () => {
    mocks.results = [{ data: { id: 'rec-1', is_active: false }, error: null }];
    const res = await PATCH(
      new Request('http://x', { method: 'PATCH', body: JSON.stringify({ is_active: false }) }),
      params('services'),
    );
    expect(res.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith('services', 'edit');
    const q = mocks.calls[0];
    expect(q).toContainEqual(['update', { is_active: false }]);
    expect(q).toContainEqual(['eq', 'account_id', 'acc-1']);
    expect(q).toContainEqual(['is', 'deleted_at', null]);
  });

  it('is refused without Edit', async () => {
    mocks.requirePermission.mockRejectedValue(new Error('no'));
    const res = await PATCH(new Request('http://x', { method: 'PATCH', body: '{}' }), params('services'));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/master/[entity]/[id]', () => {
  it('soft deletes: marks the row deleted and switched off, never removes it', async () => {
    mocks.results = [{ data: { id: 'rec-1' }, error: null }];
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), params('services'));
    expect(res.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith('services', 'delete');
    const q = mocks.calls[0];
    expect(q.some(([m]) => m === 'delete')).toBe(false);
    const update = q.find(([m]) => m === 'update')?.[1] as Record<string, unknown>;
    expect(update.is_active).toBe(false);
    expect(typeof update.deleted_at).toBe('string');
    expect(q).toContainEqual(['is', 'deleted_at', null]);
  });

  it('says Not found for a row that is already gone', async () => {
    mocks.results = [{ data: null, error: null }];
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), params('services'));
    expect(res.status).toBe(404);
  });

  it('refuses to delete a role someone still holds', async () => {
    mocks.results = [{ count: 2, error: null }];
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), params('designations'));
    expect(res.status).toBe(409);
    expect(mocks.calls).toHaveLength(1); // nothing was updated
  });

  it('deletes a role nobody holds', async () => {
    mocks.results = [{ count: 0, error: null }, { data: { id: 'rec-1' }, error: null }];
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), params('designations'));
    expect(res.status).toBe(200);
  });
});

describe('doctors are managed from Users', () => {
  it('refuses edits and deletes through the master API', async () => {
    const patch = await PATCH(new Request('http://x', { method: 'PATCH', body: '{}' }), params('doctors'));
    const del = await DELETE(new Request('http://x', { method: 'DELETE' }), params('doctors'));
    expect(patch.status).toBe(405);
    expect(del.status).toBe(405);
    expect(mocks.calls).toHaveLength(0);
  });
});

describe('data scope on leaves', () => {
  it('hides a leave outside the role's scope (404) and never updates it', async () => {
    vi.mocked(entityScope).mockResolvedValueOnce({ column: 'user_id', values: ['me'] });
    mocks.results = [{ data: { user_id: 'someone-else' }, error: null }];
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), params('leaves'));
    expect(res.status).toBe(404);
    expect(mocks.calls.flat()).not.toContainEqual(expect.arrayContaining(['update']));
  });

  it('refuses to move a leave to someone outside the scope (403)', async () => {
    vi.mocked(entityScope).mockResolvedValueOnce({ column: 'user_id', values: ['me'] });
    mocks.results = [{ data: { user_id: 'me' }, error: null }];
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ user_id: '33333333-3333-4333-8333-333333333333' }),
      }),
      params('leaves'),
    );
    expect(res.status).toBe(403);
  });
});
