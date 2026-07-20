import { describe, it, expect, vi } from 'vitest';
import { makeConfigureRolePermissions } from '../application/configure-role-permissions.usecase.js';

function build({ existing = null } = {}) {
  const roleRepository = { findByName: vi.fn(() => existing), insert: vi.fn() };
  return { uc: makeConfigureRolePermissions({ roleRepository, now: () => 1000 }), roleRepository };
}

describe('configureRolePermissions', () => {
  it('crea un rol de categoría staff con su matriz de permisos', async () => {
    const { uc, roleRepository } = build();
    const res = await uc({ name: 'Inventory', permissions: { v1: { products: ['GET', 'POST'] } } });
    expect(res.name).toBe('inventory'); // normalizado
    expect(roleRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'inventory', category: 'staff', isReserved: 0 }),
    );
  });

  it.each(['master', 'support', 'superadmin', 'user'])('rechaza el nombre reservado: %s', async (name) => {
    const { uc, roleRepository } = build();
    await expect(uc({ name })).rejects.toMatchObject({ code: 'RESERVED_ROLE' });
    expect(roleRepository.insert).not.toHaveBeenCalled();
  });

  it('rechaza un nombre inválido', async () => {
    const { uc } = build();
    await expect(uc({ name: 'X 1!' })).rejects.toMatchObject({ code: 'INVALID_ROLE_NAME' });
  });

  it('rechaza un nombre duplicado', async () => {
    const { uc } = build({ existing: { id: 'r9', name: 'inventory' } });
    await expect(uc({ name: 'inventory' })).rejects.toMatchObject({ code: 'ROLE_EXISTS' });
  });
});
