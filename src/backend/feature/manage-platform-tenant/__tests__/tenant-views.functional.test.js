import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { migratePlatform } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { tenants, platformUsers, plans, memberships, tenantStatusEvents } from '../../../config/drizzle/schema-platform.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';

const SUPER_EMAIL = 'superadmin@baas.com';
const PASSWORD = 'Password123';
const PASSPHRASE = 'frase de paso larga';

let app;
let superSid;

beforeAll(async () => {
  migratePlatform();
  const now = Date.now();

  // Registrar Superadmin
  platformDb
    .insert(platformUsers)
    .values({
      id: 'sa',
      email: SUPER_EMAIL,
      passwordHash: await hashSecret(PASSWORD),
      passphraseHash: await hashSecret(PASSPHRASE),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Registrar Tenants de Prueba
  platformDb
    .insert(tenants)
    .values([
      { id: 't1', subdomain: 'tienda-test', projectName: 'Tienda Test', status: 'active', createdAt: now, updatedAt: now },
      { id: 't2', subdomain: 'otra-test', status: 'suspended', createdAt: now, updatedAt: now },
    ])
    .run();

  // P3: t1 con contrato (plan basic sembrado por la migración) + histórico; t2 legado (sin nada).
  const basic = platformDb.select().from(plans).all().find((p) => p.name === 'basic');
  platformDb.insert(memberships).values({
    id: 'm1', tenantId: 't1', planId: basic.id, startsAt: now, endsAt: null, createdAt: now, updatedAt: now,
  }).run();
  platformDb.insert(tenantStatusEvents).values([
    { id: 'ev1', tenantId: 't1', event: 'created', createdAt: now },
    { id: 'ev2', tenantId: 't1', event: 'enabled', createdAt: now + 1000 },
  ]).run();

  app = await buildApp();

  // Login para obtener sesión
  const superLogin = await app.inject({
    method: 'POST',
    url: '/api-system/v1/login',
    payload: { email: SUPER_EMAIL, password: PASSWORD, passphrase: PASSPHRASE },
  });
  superSid = superLogin.cookies.find((c) => c.name === 'platform_sid').value;
});

afterAll(async () => {
  await app?.close();
});

describe('GET /dashboard/tenants* (SSR Tenant Management)', () => {
  it('sin sesión → redirecciona a /dashboard/login', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard/tenants' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
  });

  it('Superadmin logueado → GET /dashboard/tenants lista los subdominios de prueba', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/tenants',
      cookies: { platform_sid: superSid },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');

    const html = res.body;
    // Iter UX: H1 unificado a "Tenants" (antes "Inquilinos Registrados") — mismo string que sidebar/breadcrumb.
    expect(html).toContain('>Tenants</');
    expect(html).toContain('tienda-test.localhost');
    expect(html).toContain('otra-test.localhost');
    expect(html).toContain('Activo');
    expect(html).toContain('Suspendido');
    // P3: columnas nuevas + projectName visible (t2 legado cae al subdominio).
    expect(html).toContain('Tienda Test');
    expect(html).toContain('Histórico');
    expect(html).toContain('Plan');
    expect(html).not.toContain('Creado el');
    // Modales SSR por fila: histórico para ambos; plan solo para t1 (t2 sin contrato → '—').
    expect(html).toContain('id="history-modal-t1"');
    expect(html).toContain('id="history-modal-t2"');
    expect(html).toContain('id="plan-modal-t1"');
    expect(html).not.toContain('id="plan-modal-t2"');
    expect(html).toContain('Habilitado');
    expect(html).toContain('Permanente');
    expect(html).toContain('Sin eventos registrados'); // t2 legado
    expect(html).toContain('Básico');
    // Sidebar resalta "Tenants" cuando estamos en /dashboard/tenants*.
    expect(html).toMatch(/href="\/dashboard\/tenants"[^>]*class="[^"]*c-sidebar__link--active/);
  });

  it('Superadmin logueado → GET /dashboard/tenants/create renderiza formulario de creación', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/tenants/create',
      cookies: { platform_sid: superSid },
    });

    expect(res.statusCode).toBe(200);
    const html = res.body;
    // Iter UX: sentence case en título ("Aprovisionar nuevo tenant").
    expect(html).toContain('Aprovisionar nuevo tenant');
    expect(html).toContain('name="subdomain"');
    expect(html).toContain('name="masterEmail"');
    // P8: el input de vencimiento fue retirado — la vigencia la define el plan.
    expect(html).not.toContain('name="expiresAt"');
    expect(html).not.toContain('Fecha de vencimiento');
    // Iter 35: en cualquier página del dashboard, el sidebar del Superadmin muestra los
    // atajos externos (Clouding + Spaceship) y el botón de configuración.
    expect(html).toContain('data-action="modal:open"');
    expect(html).toContain('data-target="settings-modal"');
    expect(html).toMatch(/href="https:\/\/clouding\.io\/"[^>]*target="_blank"/);
    expect(html).toMatch(/href="https:\/\/www\.spaceship\.com\/"[^>]*target="_blank"/);
    // El modal de configuración está montado en el layout.
    expect(html).toMatch(/id="settings-modal"/);
    expect(html).toContain('data-component="theme-settings"');
  });

  it('Superadmin logueado → GET /dashboard/tenants/:id/update renderiza detalle y controles de estado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/tenants/t1/update',
      cookies: { platform_sid: superSid },
    });

    expect(res.statusCode).toBe(200);
    const html = res.body;
    expect(html).toContain('Gestionar Tenant: tienda-test');
    expect(html).toContain('Información General');
    expect(html).toContain('t1');
    expect(html).toContain('tienda-test.localhost:3000');
    expect(html).toContain('Acciones de Control');
    expect(html).toContain('Suspender Tenant');
    expect(html).toContain('Eliminar tenant (soft-delete)');
    // Nueva tarjeta de edición: nombre del proyecto (editable) + subdominio (solo lectura, no editable).
    expect(html).toContain('Configuración');
    expect(html).toContain('Nombre del Proyecto');
    expect(html).toContain('name="projectName"');
    expect(html).toContain('Guardar cambios');
    // El subdominio NO se expone como campo editable.
    expect(html).not.toContain('name="subdomain"');
  });
});

describe('REST APIs for Tenant Status and Deletion', () => {
  it('Superadmin → PATCH /api-system/v1/tenants/:id/status con desiredStatus cambia el estado', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api-system/v1/tenants/t1/status',
      cookies: { platform_sid: superSid },
      payload: { desiredStatus: 'suspended' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ id: 't1', status: 'suspended' });

    const row = platformDb.select().from(tenants).where(eq(tenants.id, 't1')).limit(1).all()[0];
    expect(row.status).toBe('suspended');
  });

  it('Superadmin → PATCH /api-system/v1/tenants/:id con projectName lo actualiza (trim)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api-system/v1/tenants/t1',
      cookies: { platform_sid: superSid },
      payload: { projectName: '  Tienda Renombrada  ' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ id: 't1', projectName: 'Tienda Renombrada' });

    const row = platformDb.select().from(tenants).where(eq(tenants.id, 't1')).limit(1).all()[0];
    expect(row.projectName).toBe('Tienda Renombrada');
  });

  it('PATCH /:id con projectName vacío → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api-system/v1/tenants/t1',
      cookies: { platform_sid: superSid },
      payload: { projectName: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('PATCH sin body → 400 VALIDATION_ERROR (exige desiredStatus)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api-system/v1/tenants/t1/status',
      cookies: { platform_sid: superSid },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('PATCH con desiredStatus igual al actual → no-op idempotente (200)', async () => {
    // t1 quedó suspended del test anterior; reintentar suspended no re-invierte.
    const res = await app.inject({
      method: 'PATCH',
      url: '/api-system/v1/tenants/t1/status',
      cookies: { platform_sid: superSid },
      payload: { desiredStatus: 'suspended' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ id: 't1', status: 'suspended' });
  });

  it('Superadmin → DELETE /api-system/v1/tenants/:id con confirmSubdomain realiza soft-delete', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api-system/v1/tenants/t2',
      cookies: { platform_sid: superSid },
      payload: { confirmSubdomain: 'otra-test' },
    });

    expect(res.statusCode).toBe(200);

    const row = platformDb.select().from(tenants).where(eq(tenants.id, 't2')).limit(1).all()[0];
    expect(row.deletedAt).not.toBeNull();
  });

  it('DELETE sin confirmSubdomain → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api-system/v1/tenants/t1',
      cookies: { platform_sid: superSid },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('DELETE con confirmSubdomain que no coincide → 422 SUBDOMAIN_MISMATCH', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api-system/v1/tenants/t1',
      cookies: { platform_sid: superSid },
      payload: { confirmSubdomain: 'algo-distinto' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('SUBDOMAIN_MISMATCH');
  });
});
