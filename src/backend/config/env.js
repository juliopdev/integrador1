import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// ES: Carga las variables de entorno desde el archivo .env en el directorio raíz.
// EN: Load environment variables from the .env file in the root directory.
dotenv.config();

/**
 * ES: Esquema de validación para las variables de entorno utilizando Zod.
 * Define los tipos requeridos, restricciones y valores por defecto para la configuración del backend.
 * 
 * EN: Validation schema for environment variables using Zod.
 * Defines required types, constraints, and default values for the backend configuration.
 */
export const envSchema = z.object({
  // ES: Puerto en el que escuchará el servidor Fastify.
  // EN: Port number on which the Fastify server will listen.
  PORT: z.coerce.number().default(3000),

  // ES: Entorno de ejecución (desarrollo, producción o pruebas).
  // EN: Execution environment (development, production, or testing).
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // ES: URL de conexión para la base de datos de auditoría de logs en MongoDB Atlas.
  // EN: Connection URL for the MongoDB Atlas logs audit database.
  MONGO_ATLAS_URL: z.string().default('mongodb+srv://mock:mock@cluster.mongodb.net/system_logs'),

  // ES: Clave secreta para firmar y verificar tokens JWT.
  // EN: Secret key used for signing and verifying JWT tokens.
  JWT_SECRET: z.string().default('supersecretjwtkeyforlocaldevelopmentonly12345'),

  // ES: Ruta relativa de almacenamiento de la base de datos del sistema (SQLite).
  // EN: Relative storage path for the system SQLite database.
  SYSTEM_DB_PATH: z.string().default('data/system.db'),

  // ES: Carpeta donde se alojarán los archivos de base de datos de los inquilinos (SQLite).
  // EN: Folder path where tenant SQLite database files will be located.
  TENANTS_DB_DIR: z.string().default('data/tenants'),
});

// ES: Parsea y valida las variables de entorno actuales.
// EN: Parse and validate the current process environment variables.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment validation failed / Falló la validación del entorno:', parsed.error.format());
  process.exit(1);
}

/**
 * ES: Objeto de configuración de entorno validado y tipado.
 * EN: Validated and typed environment configuration object.
 * @type {z.infer<typeof envSchema>}
 */
export const env = parsed.data;
