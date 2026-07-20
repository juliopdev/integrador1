import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeSetHostedDeploy } from '../application/set-hosted-deploy.usecase.js';
import { NotFoundError, AppError } from '../../../common/errors.js';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as childProcess from 'node:child_process';
import { createFsAdapter } from '../../../infrastructure/providers/fs.adapter.js';

// Mock node-unrar-js dynamically using vitest.
vi.mock('node-unrar-js', () => {
  return {
    createExtractorFromFile: vi.fn().mockImplementation(async ({ filepath, targetPath }) => {
      // Escribir index.html simulado para que pase la validación
      writeFileSync(join(targetPath, 'index.html'), '<html><head><title>Test</title></head><body></body></html>');
      return {
        extract: () => ({
          files: [{}]
        })
      };
    })
  };
});

// Mock child_process.execSync, execFileSync y execFile para simular extracción de ZIP
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    execSync: vi.fn().mockImplementation((cmd, opts) => {
      const dest = opts?.cwd;
      if (dest) {
        writeFileSync(join(dest, 'index.html'), '<html><head><title>Test ZIP</title></head><body></body></html>');
      }
      return Buffer.from('ok');
    }),
    execFileSync: vi.fn().mockImplementation((file, args, opts) => {
      const dest = opts?.cwd;
      if (dest) {
        writeFileSync(join(dest, 'index.html'), '<html><head><title>Test ZIP</title></head><body></body></html>');
      }
      return Buffer.from('ok');
    }),
    execFile: vi.fn().mockImplementation((cmd, args, opts) => {
      const dest = opts?.cwd;
      if (dest) {
        writeFileSync(join(dest, 'index.html'), '<html><head><title>Test ZIP</title></head><body></body></html>');
      }
      return { stdout: 'ok' };
    })
  };
});

describe('set-hosted-deploy.usecase — extracción, validación e inyección', () => {
  let tmpDir;
  let deployRepository;
  let tenantRepository;
  const fsAdapter = createFsAdapter();

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hosted-test-'));
    deployRepository = {
      upsert: vi.fn().mockReturnValue('deploy-id-123'),
    };
    tenantRepository = {
      findById: vi.fn().mockImplementation((id) => {
        if (id === 't-valid') return { id: 't-valid', subdomain: 'valid' };
        return null;
      }),
    };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('tenant inexistente → throws NotFoundError', async () => {
    const usecase = makeSetHostedDeploy({ deployRepository, tenantRepository, fsAdapter, frontendsDir: tmpDir });
    await expect(usecase({ tenantId: 't-invalid', buffer: Buffer.from(''), filename: 'app.zip' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('extensión no soportada → throws AppError INVALID_FILE_TYPE', async () => {
    const usecase = makeSetHostedDeploy({ deployRepository, tenantRepository, fsAdapter, frontendsDir: tmpDir });
    await expect(usecase({ tenantId: 't-valid', buffer: Buffer.from(''), filename: 'app.tar.gz' }))
      .rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });

  it('archivo ZIP válido → extrae, inyecta variables, borra tmp y persiste', async () => {
    const usecase = makeSetHostedDeploy({
      deployRepository,
      tenantRepository,
      fsAdapter,
      frontendsDir: tmpDir,
      now: () => 123456,
    });

    const result = await usecase({
      tenantId: 't-valid',
      buffer: Buffer.from('mock-zip-content'),
      filename: 'app.zip',
      envVarsText: 'API_URL=https://api.test\nAPP_TITLE=My App',
    });

    expect(result).toEqual({
      tenantId: 't-valid',
      mode: 'hosted',
      envVars: {
        API_URL: 'https://api.test',
        APP_TITLE: 'My App',
      },
      extractedPath: join(tmpDir, 't-valid'),
      status: 'active',
      updatedAt: 123456,
    });

    // Validar persistencia en DB
    expect(deployRepository.upsert).toHaveBeenCalledWith({
      id: expect.any(String),
      tenantId: 't-valid',
      mode: 'hosted',
      externalUrl: null,
      envVarsJson: JSON.stringify({ API_URL: 'https://api.test', APP_TITLE: 'My App' }),
      extractedPath: join(tmpDir, 't-valid'),
      status: 'active',
      now: 123456,
    });

    // Validar inyección en index.html de destino
    const destIndex = join(tmpDir, 't-valid', 'index.html');
    expect(existsSync(destIndex)).toBe(true);
    const content = readFileSync(destIndex, 'utf-8');
    expect(content).toContain('<script>window.env = {"API_URL":"https://api.test","APP_TITLE":"My App"}; window.__ENV__ = { ...window.__ENV__, ...{"API_URL":"https://api.test","APP_TITLE":"My App"} };</script>');
  });

  it('archivo RAR válido → extrae, inyecta variables y persiste', async () => {
    const usecase = makeSetHostedDeploy({
      deployRepository,
      tenantRepository,
      fsAdapter,
      frontendsDir: tmpDir,
      now: () => 123456,
    });

    const result = await usecase({
      tenantId: 't-valid',
      buffer: Buffer.from('mock-rar-content'),
      filename: 'app.rar',
      envVarsText: 'DEBUG=true',
    });

    expect(result.mode).toBe('hosted');
    expect(deployRepository.upsert).toHaveBeenCalled();

    const destIndex = join(tmpDir, 't-valid', 'index.html');
    const content = readFileSync(destIndex, 'utf-8');
    expect(content).toContain('<script>window.env = {"DEBUG":"true"}; window.__ENV__ = { ...window.__ENV__, ...{"DEBUG":"true"} };</script>');
  });
});
