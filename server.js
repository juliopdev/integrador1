import app from './src/backend/kernel/app.js';
import { env } from './src/backend/config/env.js';

/**
 * ES: Función autoejecutable encargada de arrancar el servidor Fastify en el puerto configurado.
 * Maneja excepciones críticas de inicio deteniendo de forma segura el proceso del sistema.
 * 
 * EN: Self-executing function responsible for booting up the Fastify server on the configured port.
 * Handles critical startup exceptions by safely terminating the system process.
 */
const start = async () => {
  try {
    // ES: Escucha en todas las interfaces de red locales (0.0.0.0) en el puerto indicado.
    // EN: Listen on all local network interfaces (0.0.0.0) on the specified port.
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`🚀 Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
