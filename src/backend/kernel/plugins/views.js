import view from '@fastify/view';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as viewHelpers from '../../common/views/helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
// Root = src/ para alcanzar AMBOS árboles (backend/feature/* y frontend/{layouts,components}/*).
// Render: reply.view('frontend/layouts/auth', { page: 'backend/feature/.../pages/_admin-login', ... }).
// Includes ROOT-RELATIVE (sin './'): se resuelven desde src/ (frontend/components/..., backend/feature/...).
// Includes relativos (con '../'): resolución nativa de EJS. Ver .doc/rules/views.md y ejs.md.
const SRC_ROOT = join(here, '..', '..', '..');

function includer(originalPath, parsedPath) {
  if (originalPath.startsWith('.')) {
    return { filename: parsedPath }; // relativo → EJS ya lo resolvió
  }
  const rel = originalPath.endsWith('.ejs') ? originalPath : `${originalPath}.ejs`;
  return { filename: join(SRC_ROOT, rel) };
}

/**
 * Registra el plugin @fastify/view con motor EJS para renderizado SSR.
 * Configura la raíz de templates en `src/` para alcanzar los árboles `frontend/` y `backend/feature/`,
 * e inyecta los helpers de vista (`escHtml`, `fmtDate`, etc.) en el contexto global de todas las plantillas.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @returns {Promise<void>}
 */
export async function registerViews(app) {
  await app.register(view, {
    engine: { ejs },
    root: SRC_ROOT,
    viewExt: 'ejs',
    // `defaultContext` inyecta valores globales visibles en TODA plantilla EJS. Aquí exponemos
    // los helpers de vista (escHtml, fmtDate, fmtDateTime, tenantCell) para que ninguna sección
    // necesite redeclararlos — evita las divergencias que causaron XSS latentes (Iter 2026-07).
    // Ver src/backend/common/views/helpers.js.
    defaultContext: { ...viewHelpers },
    options: { async: false, includer },
  });
}
