import { describe, it, expect, vi } from 'vitest';
import { makeUpdateStaffRole } from '../application/update-staff-role.usecase.js';

function build({ user = { id: 'u1' }, role = { id: 'r1', category: 'staff' } } = {}) {
  const staffRepository = {
    findUserById: vi.fn(() => user),
    findRoleById: vi.fn(() => role),
    assignRole: vi.fn(),
    revokeRole: vi.fn(),
  };
  return { uc: makeUpdateStaffRole({ staffRepository, now: () => 1000 }), staffRepository };
}

describe('updateStaffRole', () => {
  it('asigna un rol de staff', async () => {
    const { uc, staffRepository } = build();
    await uc({ userId: 'u1', roleId: 'r1', action: 'assign' });
    expect(staffRepository.assignRole).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', roleId: 'r1' }));
  });

  it('revoca un rol', async () => {
    const { uc, staffRepository } = build();
    await uc({ userId: 'u1', roleId: 'r1', action: 'revoke' });
    expect(staffRepository.revokeRole).toHaveBeenCalledWith({ userId: 'u1', roleId: 'r1' });
  });

  it('rechaza un colaborador inexistente', async () => {
    const { uc } = build({ user: null });
    await expect(uc({ userId: 'x', roleId: 'r1', action: 'assign' })).rejects.toMatchObject({ code: 'STAFF_NOT_FOUND' });
  });

  it('rechaza un rol inexistente', async () => {
    const { uc } = build({ role: null });
    await expect(uc({ userId: 'u1', roleId: 'x', action: 'assign' })).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' });
  });

  it('rechaza ascender a un rol no-staff (p.ej. master)', async () => {
    const { uc } = build({ role: { id: 'rm', category: 'master' } });
    await expect(uc({ userId: 'u1', roleId: 'rm', action: 'assign' })).rejects.toMatchObject({ code: 'ROLE_NOT_ASSIGNABLE' });
  });
});
