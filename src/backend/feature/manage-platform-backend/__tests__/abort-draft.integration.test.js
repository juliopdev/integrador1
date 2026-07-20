import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { backendContracts, tenantProviders } from '../../../config/drizzle/schema-tenant.js';
import { migrateTenant } from '../../../config/drizzle/migrator.js';
import { createProviderRepository } from '../../manage-platform-provider/infrastructure/provider-tenant.repository.js';
import { createContractRepository } from '../../../infrastructure/no-code/contract.repository.js';
import { makeStartDraft } from '../application/start-draft.usecase.js';
import { makeAbortDraft } from '../application/abort-draft.usecase.js';

/**
 * Regresión de seguridad: al iniciar un draft, `tenant_providers` queda snapshoteado dentro del
 * schema del draft. Al abortar ("Reiniciar" en la UI) se restaura ese snapshot, revirtiendo
 * cualquier linkeo/deslinkeo/cambio de credenciales hecho durante la edición. Antes de este fix,
 * el DELETE /backend/draft sólo borraba la fila del draft y los efectos secundarios en
 * `tenant_providers` persistían — vector peligroso.
 */
describe('abort-draft: restaura tenant_providers al snapshot capturado en startDraft', () => {
  let db;
  let providerRepository;
  let contractRepository;
  let startDraft;
  let abortDraft;
  let tmp;
  let originalDir;
  let sqlite;
  const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'baas-abort-draft-'));
    originalDir = env.TENANTS_DB_DIR;
    env.TENANTS_DB_DIR = tmp;
    migrateTenant('t-abort');
    sqlite = new Database(join(tmp, 't-abort.db'));
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite);
    providerRepository = createProviderRepository({ db });
    contractRepository = createContractRepository({ db });
    startDraft = makeStartDraft({ contractRepository, providerRepository });
    abortDraft = makeAbortDraft({ contractRepository, providerRepository, logger: silentLogger });
    return () => {
      sqlite.close();
      env.TENANTS_DB_DIR = originalDir;
      rmSync(tmp, { recursive: true, force: true });
    };
  });

  it('linkeo NUEVO durante el draft → abort lo deshabilita (rollback)', async () => {
    // Estado inicial: sin providers.
    expect(providerRepository.list()).toEqual([]);

    // 1) Iniciamos draft (upgrade porque no hay publicado).
    await startDraft({ mode: 'upgrade' });

    // 2) El operador linkea Neon durante el draft.
    providerRepository.upsert({
      category: 'database', provider: 'neon',
      configValuesJson: JSON.stringify({ cipher: 'x' }), now: Date.now(),
    });
    // P8.4b: `list()` ahora incluye `settings` (default `{}` para providers sin políticas
    // declaradas en el registry, o vacío antes de que existan). `toMatchObject` chequea la
    // intención sin acoplar el test al shape completo.
    expect(providerRepository.list()).toMatchObject([
      { category: 'database', provider: 'neon', enabled: 1 },
    ]);

    // 3) Se arrepiente y "Reinicia".
    const result = await abortDraft();
    expect(result).toEqual({ deleted: true, restored: 1 });

    // 4) Neon queda deshabilitado (credenciales se conservan para relinkeo manual — misma política
    //    que el botón "Deslinkear").
    const linked = providerRepository.list().filter((p) => p.enabled);
    expect(linked).toEqual([]);
  });

  it('deslinkeo durante el draft → abort lo re-habilita (rollback)', async () => {
    // Estado inicial: Neon YA linkeado (previo al draft).
    providerRepository.upsert({
      category: 'database', provider: 'neon',
      configValuesJson: JSON.stringify({ cipher: 'original' }), now: Date.now() - 10000,
    });
    expect(providerRepository.list()).toMatchObject([{ category: 'database', provider: 'neon', enabled: 1 }]);

    // Iniciamos draft — snapshot debe capturar Neon habilitado.
    await startDraft({ mode: 'upgrade' });

    // Deslinkeamos Neon durante el draft.
    providerRepository.disable({ category: 'database', provider: 'neon', now: Date.now() });
    expect(providerRepository.list()[0].enabled).toBe(0);

    // Abortamos — Neon debe volver a estar habilitado.
    const result = await abortDraft();
    expect(result.deleted).toBe(true);
    expect(result.restored).toBeGreaterThan(0);
    expect(providerRepository.list()).toMatchObject([{ category: 'database', provider: 'neon', enabled: 1 }]);
  });

  it('cambio de credenciales durante el draft → abort restaura las credenciales originales', async () => {
    const originalCipher = JSON.stringify({ ct: 'original-encrypted-blob' });
    const newCipher = JSON.stringify({ ct: 'nuevo-cifrado' });

    providerRepository.upsert({
      category: 'database', provider: 'neon',
      configValuesJson: originalCipher, now: Date.now() - 10000,
    });

    await startDraft({ mode: 'upgrade' });

    // Sobrescribimos las credenciales de Neon durante el draft.
    providerRepository.upsert({
      category: 'database', provider: 'neon',
      configValuesJson: newCipher, now: Date.now(),
    });

    // Verificamos que el estado actual tiene el nuevo cifrado.
    const rawBefore = db.select().from(tenantProviders).all()[0];
    expect(rawBefore.configValuesJson).toBe(newCipher);

    await abortDraft();

    // El blob cifrado debe haber vuelto al original.
    const rawAfter = db.select().from(tenantProviders).all()[0];
    expect(rawAfter.configValuesJson).toBe(originalCipher);
    expect(rawAfter.enabled).toBe(1);
  });

  it('abort sin draft → { deleted: false, restored: 0 } (idempotente)', async () => {
    const result = await abortDraft();
    expect(result).toEqual({ deleted: false, restored: 0 });
  });

  it('la fila del draft se elimina tras el restore', async () => {
    await startDraft({ mode: 'upgrade' });
    const before = db.select().from(backendContracts).all();
    expect(before.some((r) => r.status === 'draft')).toBe(true);
    await abortDraft();
    const drafts = db.select().from(backendContracts).all().filter((r) => r.status === 'draft');
    expect(drafts).toEqual([]);
  });
});
