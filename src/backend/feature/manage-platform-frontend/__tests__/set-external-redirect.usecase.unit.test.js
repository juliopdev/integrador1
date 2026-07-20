import { describe, it, expect, vi } from 'vitest';
import { makeSetExternalRedirect } from '../application/set-external-redirect.usecase.js';
import { DomainError, NotFoundError } from '../../../common/errors.js';

const tenant = { id: 't1', subdomain: 'shop' };

function makeDeps({ tenantFound = tenant } = {}) {
  const deployRepository = { upsert: vi.fn(() => 'd1'), findByTenantId: vi.fn(() => null) };
  const tenantRepository = { findById: vi.fn(() => tenantFound) };
  const caddyProxy = { registerRedirect: vi.fn(async () => ({ applied: false, reason: 'stub' })) };
  const logger = { error: vi.fn() };
  return {
    deployRepository, tenantRepository, caddyProxy, logger,
    usecase: makeSetExternalRedirect({ deployRepository, tenantRepository, caddyProxy, logger, now: () => 999 }),
  };
}

describe('set-external-redirect.usecase — validación URL + persistencia + notificación Caddy', () => {
  it('URL HTTPS válida → upsert como external + notifica al proxy', async () => {
    const { deployRepository, caddyProxy, usecase } = makeDeps();
    const result = await usecase({ tenantId: 't1', externalUrl: 'https://mitienda.com/' });
    expect(deployRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1', mode: 'external', externalUrl: 'https://mitienda.com/', status: 'active', now: 999,
    }));
    expect(caddyProxy.registerRedirect).toHaveBeenCalledWith({
      subdomain: 'shop', externalUrl: 'https://mitienda.com/',
    });
    expect(result.mode).toBe('external');
  });

  it('URL HTTP → INSECURE_URL (mitigación mixed-content y MITM)', async () => {
    const { deployRepository, usecase } = makeDeps();
    await expect(usecase({ tenantId: 't1', externalUrl: 'http://mitienda.com/' }))
      .rejects.toMatchObject({ code: 'INSECURE_URL' });
    expect(deployRepository.upsert).not.toHaveBeenCalled();
  });

  it('URL con puerto personalizado (:8080) → VALIDATION_ERROR', async () => {
    const { usecase } = makeDeps();
    await expect(usecase({ tenantId: 't1', externalUrl: 'https://mitienda.com:8080/' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('URL con puerto 443 (default HTTPS) → OK', async () => {
    const { deployRepository, usecase } = makeDeps();
    await usecase({ tenantId: 't1', externalUrl: 'https://mitienda.com:443/' });
    expect(deployRepository.upsert).toHaveBeenCalled();
  });

  it('URL malformada → VALIDATION_ERROR', async () => {
    const { usecase } = makeDeps();
    await expect(usecase({ tenantId: 't1', externalUrl: 'no-es-url' }))
      .rejects.toBeInstanceOf(DomainError);
  });

  it('URL vacía → VALIDATION_ERROR', async () => {
    const { usecase } = makeDeps();
    await expect(usecase({ tenantId: 't1', externalUrl: '   ' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('URL > 2000 chars → VALIDATION_ERROR', async () => {
    const { usecase } = makeDeps();
    const huge = 'https://example.com/' + 'a'.repeat(2100);
    await expect(usecase({ tenantId: 't1', externalUrl: huge }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('tenant inexistente → NotFoundError (no toca repo ni Caddy)', async () => {
    const { deployRepository, caddyProxy, usecase } = makeDeps({ tenantFound: null });
    await expect(usecase({ tenantId: 'nope', externalUrl: 'https://x.com/' }))
      .rejects.toBeInstanceOf(NotFoundError);
    expect(deployRepository.upsert).not.toHaveBeenCalled();
    expect(caddyProxy.registerRedirect).not.toHaveBeenCalled();
  });

  it('Caddy falla → NO propaga (persistencia manda; log del error)', async () => {
    const caddyBroken = { registerRedirect: vi.fn(async () => { throw new Error('caddy down'); }) };
    const deployRepository = { upsert: vi.fn(() => 'd1'), findByTenantId: vi.fn(() => null) };
    const tenantRepository = { findById: vi.fn(() => tenant) };
    const logger = { error: vi.fn() };
    const usecase = makeSetExternalRedirect({ deployRepository, tenantRepository, caddyProxy: caddyBroken, logger });
    const result = await usecase({ tenantId: 't1', externalUrl: 'https://x.com/' });
    expect(result.mode).toBe('external');
    expect(deployRepository.upsert).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
