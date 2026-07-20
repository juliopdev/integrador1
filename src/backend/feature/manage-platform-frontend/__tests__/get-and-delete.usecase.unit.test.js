import { describe, it, expect, vi } from 'vitest';
import { makeGetFrontendDeploys } from '../application/get-frontend-deploys.usecase.js';
import { makeGetFrontendDeploy } from '../application/get-frontend-deploy.usecase.js';
import { makeDeleteFrontendDeploy } from '../application/delete-frontend-deploy.usecase.js';
import { NotFoundError } from '../../../common/errors.js';

const tenant = { id: 't1', subdomain: 'shop' };

describe('get-frontend-deploys.usecase — join tenants + deploys', () => {
  it('mappea el shape del repo a {tenantId, subdomain, projectName, tenantStatus, deploy|null}', async () => {
    const rows = [
      { tenantId: 't1', subdomain: 'shop', projectName: 'Mi Shop', tenantStatus: 'active', deployId: 'd1', deployMode: 'external', deployExternalUrl: 'https://a.com/', deployStatus: 'active', deployUpdatedAt: 100 },
      { tenantId: 't2', subdomain: 'blog', projectName: 'Mi Blog', tenantStatus: 'active', deployId: null, deployMode: null, deployExternalUrl: null, deployStatus: null, deployUpdatedAt: null },
    ];
    const usecase = makeGetFrontendDeploys({ deployRepository: { listWithTenants: () => rows } });
    const result = await usecase();
    expect(result[0]).toMatchObject({ tenantId: 't1', projectName: 'Mi Shop', deploy: { mode: 'external', externalUrl: 'https://a.com/' } });
    expect(result[1]).toEqual({ tenantId: 't2', subdomain: 'blog', projectName: 'Mi Blog', tenantStatus: 'active', deploy: null });
  });
});

describe('get-frontend-deploy.usecase', () => {
  it('tenant existente + deploy configurado → {tenant, deploy}', async () => {
    const deploy = { id: 'd1', tenantId: 't1', mode: 'external', externalUrl: 'https://a.com/', status: 'active' };
    const usecase = makeGetFrontendDeploy({
      deployRepository: { findByTenantId: () => deploy },
      tenantRepository: { findById: () => tenant },
    });
    const result = await usecase({ tenantId: 't1' });
    expect(result).toEqual({ tenant, deploy });
  });

  it('tenant sin deploy → {tenant, deploy: null}', async () => {
    const usecase = makeGetFrontendDeploy({
      deployRepository: { findByTenantId: () => null },
      tenantRepository: { findById: () => tenant },
    });
    const result = await usecase({ tenantId: 't1' });
    expect(result.deploy).toBeNull();
  });

  it('tenant inexistente → NotFoundError', async () => {
    const usecase = makeGetFrontendDeploy({
      deployRepository: { findByTenantId: () => null },
      tenantRepository: { findById: () => null },
    });
    await expect(usecase({ tenantId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('delete-frontend-deploy.usecase', () => {
  function makeDeps({ deploy = { id: 'd1' } } = {}) {
    const deployRepository = { findByTenantId: vi.fn(() => deploy), deleteByTenantId: vi.fn(() => 1) };
    const tenantRepository = { findById: vi.fn(() => tenant) };
    const caddyProxy = { removeRedirect: vi.fn(async () => ({ applied: false })) };
    return {
      deployRepository, tenantRepository, caddyProxy,
      usecase: makeDeleteFrontendDeploy({ deployRepository, tenantRepository, caddyProxy }),
    };
  }

  it('deploy existente → notifica Caddy + borra la fila', async () => {
    const { deployRepository, caddyProxy, usecase } = makeDeps();
    const result = await usecase({ tenantId: 't1' });
    expect(caddyProxy.removeRedirect).toHaveBeenCalledWith({ subdomain: 'shop' });
    expect(deployRepository.deleteByTenantId).toHaveBeenCalledWith('t1');
    expect(result).toEqual({ tenantId: 't1', deleted: true });
  });

  it('deploy inexistente → DEPLOY_NOT_FOUND (no toca Caddy ni delete)', async () => {
    const { caddyProxy, deployRepository, usecase } = makeDeps({ deploy: null });
    await expect(usecase({ tenantId: 't1' })).rejects.toMatchObject({ code: 'DEPLOY_NOT_FOUND' });
    expect(caddyProxy.removeRedirect).not.toHaveBeenCalled();
    expect(deployRepository.deleteByTenantId).not.toHaveBeenCalled();
  });

  it('tenant inexistente → TENANT_NOT_FOUND', async () => {
    const deployRepository = { findByTenantId: vi.fn(), deleteByTenantId: vi.fn() };
    const usecase = makeDeleteFrontendDeploy({
      deployRepository,
      tenantRepository: { findById: () => null },
      caddyProxy: { removeRedirect: vi.fn() },
    });
    await expect(usecase({ tenantId: 'nope' })).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
  });
});
