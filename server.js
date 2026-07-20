/**
 * @file Punto de entrada del servidor HTTP principal (proceso PM2 "baas-server").
 * Inicializa Fastify, ejecuta migraciones Drizzle de plataforma, siembra el superadmin
 * por defecto, verifica la unicidad del superadmin, y levanta el listener.
 */

import { env } from './src/backend/config/env.js';
import { migratePlatform } from './src/backend/config/drizzle/migrator.js';
import { seedSuperadmin, assertSingleSuperadmin } from './src/backend/config/seed-superadmin.js';
import { buildApp } from './src/backend/kernel/app.js';

migratePlatform();
seedSuperadmin();
assertSingleSuperadmin();

const app = await buildApp();

/**
 * Cierra el servidor de forma ordenada al recibir señales del sistema operativo.
 * @param {'SIGINT'|'SIGTERM'} signal - Señal de terminación recibida.
 */
const shutdown = async (signal) => {
  app.log.info(`[server] Recibida ${signal}, apagando servidor de forma ordenada...`);
  try {
    await app.close();
    app.log.info('[server] Servidor apagado con exito.');
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
