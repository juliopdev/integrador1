/**
 * @file Configuración de Drizzle Kit para el esquema de plataforma (SQLite).
 * Define la ruta del schema, directorio de migraciones y credentials de la DB platform.
 */

import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  schema: './src/backend/config/drizzle/schema-platform.js',
  out: './src/backend/config/drizzle/migrations/platform',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.PLATFORM_DB_PATH || 'data/platform.db',
  },
});
