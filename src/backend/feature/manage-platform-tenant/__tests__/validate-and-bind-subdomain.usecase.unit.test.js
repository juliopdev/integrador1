import { describe, it, expect, vi } from 'vitest';
import { makeValidateAndBindSubdomain } from '../application/validate-and-bind-subdomain.usecase.js';

function build({ existing = null } = {}) {
  const tenantRepository = {
    findBySubdomain: vi.fn(() => existing),
    insertTenant: vi.fn(),
    insertStatusEvent: vi.fn(),
  };
  return { uc: makeValidateAndBindSubdomain({ tenantRepository, now: () => 1000 }), tenantRepository };
}

describe('validateAndBindSubdomain', () => {
  it('reserva un subdominio disponible (normaliza, inserta pending, devuelve tenantId)', async () => {
    const { uc, tenantRepository } = build();
    const res = await uc({ subdomain: '  MiTienda  ' });
    expect(res.subdomain).toBe('mitienda');
    expect(typeof res.tenantId).toBe('string');
    expect(tenantRepository.insertTenant).toHaveBeenCalledWith(
      expect.objectContaining({ subdomain: 'mitienda', status: 'pending', now: 1000 }),
    );
  });

  it.each(['ab', 'con espacio', 'mal_guion', 'UPPER!', '-guion', 'guion-'])(
    'rechaza formato inválido: %s',
    async (subdomain) => {
      const { uc, tenantRepository } = build();
      await expect(uc({ subdomain })).rejects.toMatchObject({ code: 'INVALID_SUBDOMAIN', statusCode: 422 });
      expect(tenantRepository.insertTenant).not.toHaveBeenCalled();
    },
  );

  it.each(['api', 'www', 'dashboard', 'admin'])('rechaza palabra reservada: %s', async (subdomain) => {
    const { uc } = build();
    await expect(uc({ subdomain })).rejects.toMatchObject({ code: 'RESERVED_SUBDOMAIN' });
  });

  it('rechaza si el subdominio ya existe (incluye soft-deleted)', async () => {
    const { uc, tenantRepository } = build({ existing: { id: 't1', subdomain: 'tomada' } });
    await expect(uc({ subdomain: 'tomada' })).rejects.toMatchObject({ code: 'SUBDOMAIN_TAKEN' });
    expect(tenantRepository.insertTenant).not.toHaveBeenCalled();
  });
});
