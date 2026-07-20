/**
 * Pruebas unitarias del caso de uso getLogs.
 * Verifica: parseo de metadataJson, tolerancia a JSON inválido,
 * filtro de level, clamp de limit y coerción de before numérico.
 *
 * @module ManagePlatformLogGetLogsUnitTest
 */
import { describe, it, expect, vi } from 'vitest';
import { makeGetLogs } from '../application/get-logs.usecase.js';

/**
 * Crea dependencias mock para el caso de uso getLogs.
 * @param {Object} [opts]
 * @param {Array} [opts.rows=[]] - Filas simuladas de log.
 * @param {Object} [opts.counts] - Conteos simulados.
 * @returns {{ logRepository: Object, usecase: Function }}
 */
function makeDeps({ rows = [], counts = { total: 0, info: 0, warn: 0, error: 0 } } = {}) {
  const logRepository = { list: vi.fn(() => rows), counts: vi.fn(() => counts) };
  return { logRepository, usecase: makeGetLogs({ logRepository }) };
}

describe('get-logs.usecase', () => {
  it('parsea metadataJson y devuelve counts + logs', async () => {
    const rows = [{ id: 'a', level: 'info', message: 'hola', metadataJson: '{"x":1}', createdAt: 100 }];
    const { usecase } = makeDeps({ rows, counts: { total: 10, info: 5, warn: 3, error: 2 } });
    const res = await usecase();
    expect(res.logs[0]).toEqual({ id: 'a', level: 'info', message: 'hola', metadata: { x: 1 }, createdAt: 100 });
    expect(res.counts.total).toBe(10);
  });

  it('metadataJson inválido → metadata=null (no revienta)', async () => {
    const rows = [{ id: 'a', level: 'warn', message: 'x', metadataJson: 'not-json', createdAt: 1 }];
    const { usecase } = makeDeps({ rows });
    const res = await usecase();
    expect(res.logs[0].metadata).toBeNull();
  });

  it('level fuera de {info,warn,error} → ignorado (no filtro)', async () => {
    const { logRepository, usecase } = makeDeps();
    await usecase({ level: 'debug' });
    expect(logRepository.list).toHaveBeenCalledWith(expect.objectContaining({ level: null }));
  });

  it('limit clampado a [1, 200]', async () => {
    const { logRepository, usecase } = makeDeps();
    await usecase({ limit: 999 });
    expect(logRepository.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
    await usecase({ limit: -5 });
    expect(logRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1 }));
  });

  it('before numérico → pasado al repo', async () => {
    const { logRepository, usecase } = makeDeps();
    await usecase({ before: '1234567890' });
    expect(logRepository.list).toHaveBeenCalledWith(expect.objectContaining({ before: 1234567890 }));
  });
});
