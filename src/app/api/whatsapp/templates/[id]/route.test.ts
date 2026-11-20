import { beforeEach, describe, expect, it, vi } from 'vitest'

// Security audit F-03: PATCH/DELETE used to call Meta for ANY signed-in
// member. They must now refuse before Meta is touched.

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  deleteMessageTemplate: vi.fn(),
  editMessageTemplate: vi.fn(),
}))

vi.mock('@/lib/auth/permission-guard', () => ({
  requireRoleAndPermission: mocks.guard,
}))
vi.mock('@/lib/auth/account', () => ({
  toErrorResponse: vi.fn(() => Response.json({ error: 'denied' }, { status: 403 })),
}))
vi.mock('@/lib/whatsapp/meta-api', () => ({
  deleteMessageTemplate: mocks.deleteMessageTemplate,
  editMessageTemplate: mocks.editMessageTemplate,
}))
vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: vi.fn(() => 'token') }))
vi.mock('@/lib/whatsapp/template-header-handle', () => ({
  ensureImageHeaderHandle: vi.fn(),
}))

import { DELETE, PATCH } from './route'

const ID = '0b6f5c2e-1c1a-4c1e-9a43-6a7d3b2c1d00'
const params = { params: Promise.resolve({ id: ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guard.mockRejectedValue(new Error('forbidden'))
})

describe('/api/whatsapp/templates/[id] authorization', () => {
  it('DELETE: refuses without templates:delete and never calls Meta', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), params)
    expect(res.status).toBe(403)
    expect(mocks.guard).toHaveBeenCalledWith('admin', 'templates', 'delete')
    expect(mocks.deleteMessageTemplate).not.toHaveBeenCalled()
  })

  it('PATCH: refuses without templates:edit and never calls Meta', async () => {
    const res = await PATCH(
      new Request('http://x', { method: 'PATCH', body: '{}' }),
      params,
    )
    expect(res.status).toBe(403)
    expect(mocks.guard).toHaveBeenCalledWith('admin', 'templates', 'edit')
    expect(mocks.editMessageTemplate).not.toHaveBeenCalled()
  })
})
