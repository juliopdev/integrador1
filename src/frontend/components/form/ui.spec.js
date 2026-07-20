// @vitest-environment jsdom
/**
 * Pruebas del componente Form.
 * Verifica expansión de claves dotted, validación, envío y renderizado dinámico.
 *
 * @module FormSpec
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Form, expandDotted } from './ui.js';
import { bus } from '../../scripts/lib/bus.js';

function mountForm() {
  document.body.innerHTML = `
    <form class="c-form" action="/api-system/v1/login" method="post">
      <input name="email" value="a@b.com" />
      <input name="password" value="secret" />
      <button type="submit">Entrar</button>
    </form>`;
  return new Form(document.querySelector('.c-form')).mount();
}

const submitForm = async () => {
  document.querySelector('.c-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0)); // flush fetch + json + emit
};

beforeEach(() => bus.all.clear());
afterEach(() => vi.restoreAllMocks());

describe('Form', () => {
  it('envía el body como JSON al action y emite form:success en 2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { accessToken: 't' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();
    bus.on('form:success', onSuccess);

    mountForm();
    await submitForm();

    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toContain('/api-system/v1/login');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ email: 'a@b.com', password: 'secret' });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('agrupa claves con notación de punto en objetos anidados (`config.uri` → `{ config: { uri } }`)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = `
      <form class="c-form" action="/api-system/v1/tenants/t1/providers" method="post">
        <input name="category" value="database" />
        <input name="provider" value="neon" />
        <input name="config.uri" value="postgresql://x" />
        <button type="submit">Linkear</button>
      </form>`;
    new Form(document.querySelector('.c-form')).mount();
    await submitForm();

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      category: 'database',
      provider: 'neon',
      config: { uri: 'postgresql://x' },
    });
  });

  it('expandDotted es idempotente sobre claves planas', () => {
    expect(expandDotted({ a: '1', b: '2' })).toEqual({ a: '1', b: '2' });
  });

  it('respeta `data-method` para verbos que el navegador normaliza (PUT/DELETE)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = `
      <form class="c-form" action="/api-system/v1/data/products/r1" data-method="put">
        <input name="title" value="nuevo" />
        <button type="submit">Guardar</button>
      </form>`;
    new Form(document.querySelector('.c-form')).mount();
    await submitForm();
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: 'nuevo' });
  });

  it('P7.2: `data-autosubmit` envía el form al cambiar un control (switch sin botón)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = `
      <form class="c-form" action="/api-system/v1/tenants/t1/backend/ws" data-method="put" data-autosubmit>
        <input type="hidden" name="channel" value="user_to_user" />
        <input type="checkbox" name="enabled" value="true" />
      </form>`;
    new Form(document.querySelector('.c-form')).mount();
    const box = document.querySelector('input[type=checkbox]');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ channel: 'user_to_user', enabled: 'true' });
  });

  it('DELETE va SIN body ni content-type (Fastify rechaza json vacío con FST_ERR_CTP_EMPTY_JSON_BODY)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = `
      <form class="c-form" action="/api-system/v1/tenants/t1/backend/draft" data-method="delete">
        <button type="submit">Reiniciar</button>
      </form>`;
    new Form(document.querySelector('.c-form')).mount();
    await submitForm();
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('recolecta valores repetidos (checkbox multi) como array', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = `
      <form class="c-form" action="/api-system/v1/tenants/t1/backend/draft/endpoints">
        <input name="path" value="/products" />
        <input name="resource" value="products" />
        <input type="checkbox" name="methods" value="GET" checked />
        <input type="checkbox" name="methods" value="POST" checked />
        <input type="checkbox" name="methods" value="PUT" />
        <button type="submit">Agregar</button>
      </form>`;
    new Form(document.querySelector('.c-form')).mount();
    await submitForm();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      path: '/products',
      resource: 'products',
      methods: ['GET', 'POST'],
    });
  });

  it('con `data-method="delete"` no envía body (fetch init omite `body`)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = `
      <form class="c-form" action="/api-system/v1/data/products/r1" data-method="delete">
        <button type="submit">Borrar</button>
      </form>`;
    new Form(document.querySelector('.c-form')).mount();
    await submitForm();
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('Iter 32 E/F: con `data-confirm` muestra window.confirm; si el usuario cancela, no llama fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    document.body.innerHTML = `
      <form class="c-form" action="/api-system/v1/tenants/t1/backend/draft" data-method="delete" data-confirm="¿Seguro?">
        <button type="submit">Descartar</button>
      </form>`;
    new Form(document.querySelector('.c-form')).mount();
    await submitForm();
    expect(confirmSpy).toHaveBeenCalledWith('¿Seguro?');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Iter 32 E/F: con `data-confirm` si el usuario acepta, sigue con el fetch normal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.body.innerHTML = `
      <form class="c-form" action="/api-system/v1/tenants/t1/backend/draft" data-method="delete" data-confirm="¿Seguro?">
        <button type="submit">Descartar</button>
      </form>`;
    new Form(document.querySelector('.c-form')).mount();
    await submitForm();
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('Iter 2026-07: swap del label mientras loading — si el submit tiene `data-loading-label`, cambia texto durante fetch y restaura en finally', async () => {
    let resolveFetch;
    const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = () => resolve({ ok: true, json: async () => ({ data: null }) }); }));
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = `
      <form class="c-form" action="/api-system/v1/tenants" method="post">
        <input name="subdomain" value="tienda" />
        <button type="submit" data-state="idle" data-loading-label="Aprovisionando…">
          <span class="c-button__label">Crear</span>
        </button>
      </form>`;
    new Form(document.querySelector('.c-form')).mount();
    const btn = document.querySelector('button');
    const labelEl = btn.querySelector('.c-button__label');
    expect(labelEl.textContent).toBe('Crear');

    // Trigger submit sin await — el label debe haber cambiado antes de resolver el fetch.
    document.querySelector('.c-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await Promise.resolve();
    expect(btn.dataset.state).toBe('loading');
    expect(labelEl.textContent).toBe('Aprovisionando…');

    // Resolvemos el fetch y flush micro-tasks.
    resolveFetch();
    await new Promise((r) => setTimeout(r, 0));
    expect(btn.dataset.state).toBe('idle');
    expect(labelEl.textContent).toBe('Crear');
  });

  it('Iter 2026-07: sin `data-loading-label` el label no se toca (retro-compat)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = `
      <form class="c-form" action="/api-system/v1/x" method="post">
        <input name="x" value="1" />
        <button type="submit"><span class="c-button__label">Enviar</span></button>
      </form>`;
    new Form(document.querySelector('.c-form')).mount();
    await submitForm();
    expect(document.querySelector('.c-button__label').textContent).toBe('Enviar');
  });

  it('lanza un toast de error y emite form:error en respuesta no-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas.' }) }));
    const onToast = vi.fn();
    const onError = vi.fn();
    bus.on('toast', onToast);
    bus.on('form:error', onError);

    mountForm();
    await submitForm();

    expect(onToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error', message: 'Credenciales inválidas.' }));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_CREDENTIALS' }));
  });
});
