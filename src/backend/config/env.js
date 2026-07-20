/**
 * Validación y parseo de variables de entorno con Zod.
 *
 * Define el esquema de todas las variables de entorno requeridas y opcionales
 * del proyecto usando Zod. Si alguna variable obligatoria falta o tiene un tipo
 * incorrecto, el proceso aborta con mensajes descriptivos antes de iniciar la app.
 * Carga las variables desde el archivo .env mediante dotenv.
 */
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Esquema de validación de variables de entorno.
 * Si algo obligatorio falta o tiene tipo incorrecto, el proceso aborta antes de levantar nada. Ver .doc/rules/environment.md.
 */
const envSchema = z.object({
  // Servidor
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Persistencia y caché
  PLATFORM_DB_PATH: z.string().default('data/platform.db'),
  TENANTS_DB_DIR: z.string().default('data/tenants'),
  MONGO_ATLAS_URL: z.string(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Seguridad
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_MASTER_KEY: z.string().length(64),
  SESSION_SECRET: z.string().min(32),

  // Observabilidad (prom-client)
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_PATH: z.string().default('/metrics'),

  // Semilla del Superadmin: solo el correo; la password/passphrase se definen
  // vía token de activación en el primer arranque (ver bootstrap.md).
  SUPER_ADMIN_EMAIL: z.string().email(),

  // Correo (Resend). MAIL_FROM por defecto al remitente sandbox del plan gratuito.
  API_KEY_RESEND: z.string().min(1),
  MAIL_FROM: z.string().default('onboarding@resend.dev'),

  // Credenciales de tests E2E (opcionales; los tests con adapter real se gatean con `if (URI)`).
  // Google OAuth es **per-tenant** (credenciales cifradas en `tenant_providers`), así que en
  // producción NO viven en `.env`. Estas vars solo alimentan un tenant de prueba durante los tests.
  TEST_OAUTH_ID_CLIENT: z.string().optional(),
  TEST_OAUTH_SECCRET_KEY: z.string().optional(),

  // Receptor del ÚNICO correo real que se dispara en el test E2E de forgot-pass (Resend). Solo se
  // envía cuando el resto de env de correo está OK; los demás tests usan un mailer mockeado.
  TEST_MAIL_TO: z.string().email().optional(),

  // Iter 54b: canales de contacto directo con el Superadmin, expuestos vía FAB en el dashboard
  // Master/Staff. Ambos opcionales — si ninguno está seteado la FAB no se renderiza. El WhatsApp
  // debe ser el número con código de país sin `+` ni espacios (formato de wa.me).
  SUPPORT_EMAIL: z.string().email().optional(),
  SUPPORT_WHATSAPP: z.string().regex(/^\d{6,15}$/).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:');
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

/** Variables de entorno validadas y tipadas. */
export const env = parsed.data;
