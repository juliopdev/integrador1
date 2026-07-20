import { describe, it, expect, vi } from 'vitest';
import { makeUpdateTenant } from '../application/update-tenant.usecase.js';

function build({ tenant = { id: 't1', subdomain: 'tienda', projectName: 'Vieja' } } = {}) {
  const tenantRepository = {
    findById: vi.fn(() => tenant),
    updateProjectName: vi.fn(),
  };
  return { uc: makeUpdateTenant({ tenantRepository, now: () => 1000 }), tenantRepository };
}

describe('updateTenant', () => {
  it('actualiza el projectName (trim) y devuelve { id, projectName }', async () => {
    const { uc, tenantRepository } = build();
    const res = await uc({ tenantId: 't1', projectName: '  Mi Tienda  ' });
    expect(res).toEqual({ id: 't1', projectName: 'Mi Tienda' });
    expect(tenantRepository.updateProjectName).toHaveBeenCalledWith({ tenantId: 't1', projectName: 'Mi Tienda', now: 1000 });
  });

  it.each(['', '   ', 'x'.repeat(81)])('rechaza projectName inválido: %s', async (projectName) => {
    const { uc, tenantRepository } = build();
    await expect(uc({ tenantId: 't1', projectName })).rejects.toMatchObject({ code: 'INVALID_PROJECT_NAME', statusCode: 422 });
    expect(tenantRepository.updateProjectName).not.toHaveBeenCalled();
  });

  it('lanza TENANT_NOT_FOUND si el tenant no existe', async () => {
    const { uc, tenantRepository } = build({ tenant: null });
    await expect(uc({ tenantId: 'nope', projectName: 'Ok' })).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND', statusCode: 404 });
    expect(tenantRepository.updateProjectName).not.toHaveBeenCalled();
  });
});
