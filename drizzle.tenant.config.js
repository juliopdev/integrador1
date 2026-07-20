/**
 * @file Configuración de Drizzle Kit para el esquema de tenants (SQLite — plantilla clonable).
 * Usa una ruta ficticia `:memory:` porque el esquema se replica en tiempo de provisión
 * a cada base de datos de tenant individual.
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/backend/config/drizzle/schema-tenant.js',
  out: './src/backend/config/drizzle/migrations/tenants',
  dialect: 'sqlite',
  dbCredentials: {
    url: ':memory:',
  },
});
