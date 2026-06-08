import { defineConfig } from 'drizzle-kit';

const dbTarget = process.env.DB_TARGET || 'system';

export default defineConfig({
  schema: './src/backend/config/drizzle/schema.js',
  out: dbTarget === 'system'
    ? './src/backend/config/drizzle/migrations/system'
    : './src/backend/config/drizzle/migrations/tenants',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbTarget === 'system' ? './data/system.db' : './data/tenants/default.db',
  },
});
