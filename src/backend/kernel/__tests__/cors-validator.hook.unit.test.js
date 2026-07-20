/**
 * Pruebas unitarias del hook de validación CORS (cors-validator.hook).
 * Verifica que permite peticiones sin Origin, sin contexto de tenant,
 * desde el propio subdominio, dominio personalizado, localhost/test,
 * y rechaza orígenes no autorizados o malformados con ForbiddenError.
 *
 * @module KernelCorsValidatorHookUnitTest
 */
import { describe, it, expect } from 'vitest';
import { registerCorsValidator } from '../hooks/cors-validator.hook.js';
import { ForbiddenError } from '../../common/errors.js';

describe('cors-validator.hook', () => {
  /**
   * Obtiene el hook onRequest registrado por registerCorsValidator.
   * @returns {Function} Hook onRequest extraído.
   */
  const getHook = () => {
    const hooks = [];
    const appMock = {
      addHook(name, fn) {
        if (name === 'onRequest') hooks.push(fn);
      },
    };
    registerCorsValidator(appMock);
    return hooks[0];
  };

  it('debe permitir peticiones que no tengan la cabecera Origin (peticiones directas o no CORS)', async () => {
    const hook = getHook();
    const request = {
      headers: {},
      tenant: { id: '123', subdomain: 'tienda' },
    };

    await expect(hook(request)).resolves.toBeUndefined();
  });

  it('debe permitir peticiones que no estén en contexto de tenant (ruta apex o superadmin)', async () => {
    const hook = getHook();
    const request = {
      headers: { origin: 'https://malicious.com' },
      tenant: null,
    };

    await expect(hook(request)).resolves.toBeUndefined();
  });

  it('debe permitir peticiones desde el propio subdominio del tenant', async () => {
    const hook = getHook();
    const request = {
      headers: { origin: 'http://tienda.localhost:3000' },
      tenant: { id: '123', subdomain: 'tienda' },
    };

    await expect(hook(request)).resolves.toBeUndefined();
  });

  it('debe permitir peticiones desde el dominio personalizado registrado del tenant', async () => {
    const hook = getHook();
    const request = {
      headers: { origin: 'https://my-store.com' },
      tenant: { id: '123', subdomain: 'tienda', externalUrl: 'https://my-store.com' },
    };

    await expect(hook(request)).resolves.toBeUndefined();
  });

  it('debe tolerar diferencias de www en el dominio personalizado del tenant', async () => {
    const hook = getHook();
    const request = {
      headers: { origin: 'https://www.my-store.com' },
      tenant: { id: '123', subdomain: 'tienda', externalUrl: 'https://my-store.com' },
    };

    await expect(hook(request)).resolves.toBeUndefined();
  });

  it('debe permitir localhost y 127.0.0.1 en desarrollo/test', async () => {
    const hook = getHook();
    const request = {
      headers: { origin: 'http://localhost:5173' },
      tenant: { id: '123', subdomain: 'tienda' },
    };

    await expect(hook(request)).resolves.toBeUndefined();
  });

  it('debe rechazar orígenes no autorizados con ForbiddenError (CORS_NOT_ALLOWED)', async () => {
    const hook = getHook();
    const request = {
      headers: { origin: 'https://malicious-site.com' },
      tenant: { id: '123', subdomain: 'tienda', externalUrl: 'https://my-store.com' },
    };

    await expect(hook(request)).rejects.toThrowError(ForbiddenError);
    await expect(hook(request)).rejects.toThrowError(/autorizado/);
  });

  it('debe rechazar orígenes malformados con ForbiddenError', async () => {
    const hook = getHook();
    const request = {
      headers: { origin: 'not-a-valid-url' },
      tenant: { id: '123', subdomain: 'tienda' },
    };

    await expect(hook(request)).rejects.toThrowError(ForbiddenError);
  });
});
