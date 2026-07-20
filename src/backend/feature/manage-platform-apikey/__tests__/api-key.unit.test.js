/**
 * Pruebas unitarias de los casos de uso generate-api-key y get-api-key-status.
 * Verifica: emisión de key formato mbk_, persistencia solo del hash,
 * regeneración revoca key anterior, consulta de estado sin exponer hash.
 *
 * @module ManagePlatformApikeyUnitTest
 */
import { describe, it, expect, vi } from 'vitest';
import { makeGenerateApiKey } from '../application/generate-api-key.usecase.js';
import { makeGetApiKeyStatus } from '../application/get-api-key-status.usecase.js';
import { hashToken } from '../../../common/token.js';

/**
 * Crea un mock de apiKeyRepository con spies.
 * @param {Object|null} active - Fila activa simulada o null.
 * @returns {Object} Repositorio mockeado con findActiveByName, insertKey, revokeKey.
 */
const makeRepo = (active = null) => ({
  findActiveByName: vi.fn(() => active),
  insertKey: vi.fn(),
  revokeKey: vi.fn(),
});

describe('generate-api-key.usecase (P4)', () => {
  it('emite una key mbk_ y persiste SOLO el hash', async () => {
    const repo = makeRepo();
    const uc = makeGenerateApiKey({ apiKeyRepository: repo, now: () => 1000 });
    const result = await uc();

    expect(result.apiKey).toMatch(/^mbk_[A-Za-z0-9_-]{32}$/);
    expect(result.regenerated).toBe(false);
    expect(repo.revokeKey).not.toHaveBeenCalled();

    const inserted = repo.insertKey.mock.calls[0][0];
    expect(inserted.name).toBe('frontend');
    expect(inserted.tokenHash).toBe(hashToken(result.apiKey));
    expect(inserted.tokenHash).not.toContain(result.apiKey); // jamás el crudo
  });

  it('regenerar revoca la key activa anterior (solo una vigente)', async () => {
    const repo = makeRepo({ id: 'k-old', name: 'frontend', status: 'active' });
    const uc = makeGenerateApiKey({ apiKeyRepository: repo, now: () => 2000 });
    const result = await uc();

    expect(repo.revokeKey).toHaveBeenCalledWith({ id: 'k-old', now: 2000 });
    expect(result.regenerated).toBe(true);
  });
});

describe('get-api-key-status.usecase (P4)', () => {
  it('sin key activa → { exists: false }', async () => {
    const uc = makeGetApiKeyStatus({ apiKeyRepository: makeRepo() });
    expect(await uc()).toEqual({ exists: false });
  });

  it('con key activa → metadatos sin hash ni valor', async () => {
    const uc = makeGetApiKeyStatus({
      apiKeyRepository: makeRepo({ id: 'k1', tokenHash: 'h', createdAt: 5, lastUsedAt: null }),
    });
    const status = await uc();
    expect(status).toEqual({ exists: true, id: 'k1', createdAt: 5, lastUsedAt: null });
    expect(JSON.stringify(status)).not.toContain('tokenHash');
  });
});
