/**
 * Pruebas funcionales de la vista SSR del dashboard.
 * Verifica: redirección sin sesión, cookie incorrecta → redirect,
 * Superadmin logueado ve home con hero + widgets (Iter 53),
 * Master logueado ve home agnóstico con tiles + counts (Iter 54).
 *
 * @module ManageAdminDashboardViewFunctionalTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { tenants, platformUsers } from '../../../config/drizzle/schema-platform.js';
import { createTenantOnboardingRepository } from '../../manage-platform-tenant/infrastructure/tenant-onboarding.repository.js';
import { makeRegisterTenantMaster } from '../../manage-platform-tenant/application/register-tenant-master.usecase.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';

const SUPER_EMAIL = 'superadmin@baas.com';
const MASTER_EMAIL = 'master@tienda.com';
const PASSWORD = 'Password123';
const PASSPHRASE = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let rawToken;
let superSid;
let masterSid;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-dash-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();

  // Crear Superadmin en platform.db
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

  // Crear Tenant
  platformDb
    .insert(tenants)
    .values([
      { id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now },
    ])
    .run();

  migrateTenant('t1');

  // Sembrar Master
  const sqlite = new Database(join(tmp, 't1.db'));
  const reg = makeRegisterTenantMaster({ repository: createTenantOnboardingRepository({ db: drizzle(sqlite) }) });
  ({ rawToken } = await reg({ email: MASTER_EMAIL }));
  sqlite.close();

  app = await buildApp();

  // Activar Master
  await app.inject({
    method: 'POST',
    url: '/api-system/v1/login',
    headers: { host: 'tienda.localhost' },
    payload: { token: rawToken, password: PASSWORD, passphrase: PASSPHRASE },
  });

  // Login Superadmin para obtener sid
  const superLogin = await app.inject({
    method: 'POST',
    url: '/api-system/v1/login',
    payload: { email: SUPER_EMAIL, password: PASSWORD, passphrase: PASSPHRASE },
  });
  superSid = superLogin.cookies.find((c) => c.name === 'platform_sid').value;

  // Login Master para obtener sid
  const masterLogin = await app.inject({
    method: 'POST',
    url: '/api-system/v1/login',
    headers: { host: 'tienda.localhost' },
    payload: { email: MASTER_EMAIL, password: PASSWORD, passphrase: PASSPHRASE },
  });
  masterSid = masterLogin.cookies.find((c) => c.name === 'tenant_sid').value;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

describe('GET /dashboard (SSR Dashboard View)', () => {
  it('sin cookie de sesión → redirecciona 302 a /dashboard/login', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
  });

  it('con cookie de sesión incorrecta → redirecciona 302 a /dashboard/login', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: { platform_sid: 'fake-session-id' },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
  });

  it('Superadmin logueado → 200 OK con home rediseñado (Iter 53): hero + 5 widgets', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: { platform_sid: superSid },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');

    const html = res.body;
    // Iter UX: pageTitle unificado al patrón `Sección · Marca`.
    expect(html).toContain('Inicio · Mi Baas');
    // El role "Superadmin" ahora sale del `c-user-pill` (Iter 52) — chequeamos el texto visible.
    expect(html).toContain('Superadmin');

    // Iter 53: hero + 4 widgets.
    expect(html).toContain('Consola del Superadmin');
    expect(html).toContain('Salud del VPS');
    expect(html).toContain('Últimos errores');
    expect(html).toContain('Actividad reciente');
    expect(html).not.toContain('Acciones rápidas');

    // Contenido de datos derivado del `getSuperadminWidgets` (health snapshot real).
    expect(html).toMatch(/Uptime[^<]*Node/); // footer del widget VPS

    // Menú lateral del Superadmin (Iter 51 + 52).
    expect(html).toContain('Frontends');
    expect(html).toContain('Backends');
    expect(html).toContain('href="/dashboard/tenants"');
    expect(html).toContain('href="/dashboard/health"');
    expect(html).toContain('href="/dashboard/logs"');

    // Sidebar footer con el `c-user-pill` (Iter 52) — reemplazó al topbar.
    expect(html).toContain('c-user-pill');
    expect(html).not.toContain('c-topbar');
  });

  it('Master logueado → 200 OK con home agnóstico (Iter 54): hero + tiles + counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: { host: 'tienda.localhost' },
      cookies: { tenant_sid: masterSid },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');

    const html = res.body;
    // Iter UX: pageTitle unificado al patrón `Sección · Marca`.
    expect(html).toContain('Inicio · Mi web tienda');
    // Role "Master" sale del `c-user-pill` (Iter 52).
    expect(html).toContain('Master');

    // Iter 54: hero personalizado + tile launcher agnóstico.
    expect(html).toMatch(/Buen día/);
    expect(html).toContain('Bienvenido a');
    expect(html).toContain('Ver mis registros');
    expect(html).toContain('¿Qué quieres hacer hoy?');

    // Iter 54b: widget "Tu backend" fue reemplazado por "Estado de mi web" (más útil al non-tech);
    // "Tu comunidad" → "Mi comunidad"; "Novedades importantes" → "Colaboradores activos".
    expect(html).toContain('Estado de tu web');
    expect(html).toContain('Mi comunidad');
    expect(html).toContain('Colaboradores activos');
    expect(html).not.toContain('Tu backend');
    expect(html).not.toContain('Novedades importantes');

    // Tiles del launcher — Master ve todos + "Ver métricas" (Iter 54b).
    expect(html).toContain('Ver mis registros');
    expect(html).toContain('Ver estadísticas');
    expect(html).toContain('Enviar un aviso');
    expect(html).toContain('Mi equipo');
    expect(html).toContain('Atender clientes');
    // Nuevo hint de Soporte — es el support de Master/Staff hacia sus clientes.
    expect(html).toContain('Respondé consultas y dudas en el chat');

    // Sidebar del Master (sigue igual desde Iter 51).
    expect(html).toContain('href="/dashboard/data"');
    expect(html).toContain('href="/dashboard/notifications"');
    expect(html).toContain('href="/dashboard/staff"');
    expect(html).toContain('href="/dashboard/docs"');

    // Nada de la vieja terminología dominio-específica del home legacy.
    expect(html).not.toContain('Estado de Recursos');
    expect(html).not.toContain('Base de Datos Tenant (SQLite)');
    // Sidebar footer con `c-user-pill` (Iter 52) — el topbar viejo no está.
    expect(html).toContain('c-user-pill');
    expect(html).not.toContain('c-topbar');
  });

  it('Master logueado con backend no publicado → sirve mensaje de error', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/docs',
      headers: { host: 'tienda.localhost' },
      cookies: { tenant_sid: masterSid },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Documentación de la API');
    expect(res.body).toContain('Backend no publicado');
  });

  it('Master logueado con backend publicado → sirve documentación interactiva completa', async () => {
    const sqlite = new Database(join(tmp, 't1.db'));
    sqlite.prepare(`
      INSERT INTO backend_contracts (id, version, schema_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'c1',
      'v1',
      JSON.stringify({
        version: 'v1',
        resources: [
          {
            name: 'products',
            physicalName: 't1_v1_products',
            store: 'sql',
            fields: [
              { id: 'f1', name: 'name', type: 'string', required: true, defaultValue: 'Producto Sin Nombre', unique: true }
            ]
          }
        ],
        endpoints: [
          { path: '/products', resource: 'products', methods: ['GET', 'POST'], access: { GET: ['public'], POST: ['master'] } }
        ]
      }),
      'published',
      Date.now(),
      Date.now()
    );
    sqlite.close();

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/docs',
      headers: { host: 'tienda.localhost' },
      cookies: { tenant_sid: masterSid },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Documentación de la API');
    expect(res.body).toContain('Guía de Integración');
    expect(res.body).toContain('/api/v1/products');
    expect(res.body).toContain('POST · master');
    expect(res.body).toContain('Producto Sin Nombre');
  });

  it('Superadmin logueado → GET /dashboard/docs redirige a /dashboard', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/docs',
      cookies: { platform_sid: superSid },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  it('Anon → GET /dashboard/docs redirige a /dashboard/login', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/docs',
      headers: { host: 'tienda.localhost' },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
  });
});
