/**
 * Seed del superadmin por defecto de la plataforma.
 *
 * Provee las funciones para crear el superadmin semilla (en estado pendiente)
 * y verificar la invariante de que exista exactamente un superadmin activo
 * en la base de datos de plataforma. Idempotente y seguro para ejecutar en
 * cada arranque.
 */
import { randomBytes, createHash } from 'node:crypto';
import { isNull } from 'drizzle-orm';
import { uuidv7 } from '../common/id.js';
import { platformDb } from './database/platform/sqlite-platform.js';
import { platformUsers, authTokens } from './drizzle/schema-platform.js';
import { env } from './env.js';

const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Guarda de invariante: la plataforma tiene exactamente UN Superadmin activo. Si al arrancar
 * hay más de uno (soft-delete excluido), es señal de un artefacto de test filtrado o de
 * manipulación manual de la DB — se loguea WARN pero NO se crashea para no bloquear la
 * operación (la decisión de qué borrar la toma el operador). El chequeo es no-op en tests
 * (cada suite arranca con `:memory:` y siembra su propio superadmin).
 *
 * Historia: incidente 2026-07-17 — un \`d@d.com\` con \`id='sa'\` (patrón hardcodeado de tests
 * funcionales) apareció en \`data/platform.db\` producción, probablemente por un test corrido
 * sin \`NODE_ENV=test\`. Este chequeo lo hubiera detectado al siguiente restart.
 * @returns {void}
 */
export function assertSingleSuperadmin() {
  if (env.NODE_ENV === 'test') return;
  const activeCount = platformDb.select({ id: platformUsers.id })
    .from(platformUsers).where(isNull(platformUsers.deletedAt)).all().length;
  if (activeCount > 1) {
    const rows = platformDb.select({ id: platformUsers.id, email: platformUsers.email })
      .from(platformUsers).where(isNull(platformUsers.deletedAt)).all();
    console.warn(
      `\n${'!'.repeat(64)}\n` +
        `  INVARIANTE ROTA: hay ${activeCount} superadmins activos en platform.db.\n` +
        `  Se espera exactamente 1. Filas detectadas:\n` +
        rows.map((r) => `    - ${r.email} (id=${r.id})`).join('\n') + '\n' +
        `  Causas típicas: test corrido sin NODE_ENV=test, INSERT manual, migración\n` +
        `  de datos incompleta. Investigá antes de exponer la app a tráfico externo.\n` +
        `${'!'.repeat(64)}\n`,
    );
  }
}

/**
 * Crea el Superadmin semilla en estado pendiente (solo email) y emite un token de
 * activación de un solo uso, cuya URL se imprime en consola. Idempotente: no hace
 * nada si ya existe un \`platform_user\`. Ver .doc/rules/bootstrap.md.
 * @returns {void}
 */
export function seedSuperadmin() {
  const exists = platformDb.select({ id: platformUsers.id }).from(platformUsers).limit(1).all();
  if (exists.length > 0) return;

  const now = Date.now();
  const userId = uuidv7();
  platformDb.insert(platformUsers).values({
    id: userId,
    email: env.SUPER_ADMIN_EMAIL,
    createdAt: now,
    updatedAt: now,
  }).run();

  // Se guarda solo el hash del token; el crudo solo viaja en la URL impresa.
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  platformDb.insert(authTokens).values({
    id: uuidv7(),
    userId,
    type: 'activation',
    tokenHash,
    expiresAt: now + ACTIVATION_TTL_MS,
    createdAt: now,
  }).run();

  const url = `${env.APP_URL}/dashboard/login?tk=${rawToken}`;
  console.log(
    `\n${'='.repeat(64)}\n` +
      `  SUPERADMIN PENDIENTE DE ACTIVACIÓN — ${env.SUPER_ADMIN_EMAIL}\n` +
      `  Abre esta URL UNA VEZ para definir tu password + passphrase:\n` +
      `  ${url}\n` +
      `  (válida 24h · un solo uso)\n` +
      `${'='.repeat(64)}\n`,
  );
}
