/**
 * Módulo de helpers globales para las vistas EJS.
 * Las funciones se inyectan en `@fastify/view` vía `defaultContext` y quedan disponibles
 * en todas las plantillas como `escHtml(...)`, `fmtDate(...)`, etc. sin necesidad de
 * importación local.
 *
 * @module helpers
 */

// Helpers globales de las vistas EJS. Se inyectan en `@fastify/view` via `defaultContext` (ver
// kernel/plugins/views.js) — quedan disponibles como `escHtml(...)`, `fmtDate(...)`, etc. en
// TODA plantilla sin necesidad de re-importarlos ni redeclararlos localmente.
//
// Historia: antes cada sección redeclaraba su propio `escHtml` inline, con implementaciones
// distintas — dos de las tres versiones sólo escapaban `&` y `<`, dejando pasar `"`, `>` y `'`
// (XSS latente en atributos y en `document.write`-like sinks). Este módulo es la única fuente.

/**
 * Escape completo para HTML. Cubre los 5 caracteres estándar de OWASP + `/` (defensa en
 * profundidad contra vectores que cierran tags via `</script>`). Devuelve string vacío para
 * `null` / `undefined` — nunca `"null"` / `"undefined"`.
 *
 * Usar en cualquier valor de usuario que se interpole via `<%- %>` (sin escape automático).
 * Para `<%= %>` (con escape automático de EJS) no es necesario, pero tampoco daña.
 *
 * @param {*} v - Valor a escapar para HTML seguro.
 * @returns {string} Cadena escapada de forma segura.
 * @example
 * escHtml('<script>alert(1)</script>')
 * // => '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;'
 * @example
 * escHtml(null) // => ''
 */
export function escHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Formatea una fecha corta localizada.
 * 
 * @param {number|Date|string|null|undefined} ms - Timestamp en milisegundos, objeto Date o valor númerico.
 * @param {string} [locale='es-ES'] - Código de locale (BCP 47).
 * @returns {string} Fecha formateada corta (ej. '14 mar 2025') o cadena vacía si el valor es nulo.
 * @example
 * fmtDate(1700000000000) // Devuelve '14 nov 2023' (para locale es-ES)
 * @example
 * fmtDate(null) // Devuelve ''
 */
export function fmtDate(ms, locale = 'es-ES') {
  if (ms == null) return '';
  return new Date(ms).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Formatea una fecha con hora localizada.
 * 
 * @param {number|Date|string|null|undefined} ms - Timestamp en milisegundos, objeto Date o valor númerico.
 * @param {string} [locale='es-ES'] - Código de locale (BCP 47).
 * @returns {string} Fecha y hora formateada (ej. '14 mar 2025, 10:30') o cadena vacía si el valor es nulo.
 * @example
 * fmtDateTime(1700000000000) // Devuelve '14 nov 2023, 05:33' (para locale es-ES)
 * @example
 * fmtDateTime(null) // Devuelve ''
 */
export function fmtDateTime(ms, locale = 'es-ES') {
  if (ms == null) return '';
  return new Date(ms).toLocaleString(locale, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Celda estándar de tenant: `projectName` grande + `subdomain.hostSuffix` chico debajo.
 * Retorna HTML listo para interpolar con `<%- %>` (los valores van escapados).
 *
 * Uniforma las 3 secciones que hoy tienen su propia versión (`nocode-tenant-cell`,
 * `l-tenant-cell` — la última respeta la convención BEM `l-` de layout).
 *
 * @param {Object} params
 * @param {string} params.projectName - Nombre del proyecto del tenant.
 * @param {string} params.subdomain - Subdominio del tenant.
 * @param {string} [params.hostSuffix='localhost'] - Sufijo de host para el enlace completo.
 * @returns {string} HTML seguro de la celda de tenant.
 * @example
 * tenantCell({ projectName: 'Mi App', subdomain: 'miapp' })
 * // => '<span class="l-tenant-cell">...'
 */
export function tenantCell({ projectName, subdomain, hostSuffix = 'localhost' }) {
  const name = escHtml(projectName || subdomain);
  const host = `${escHtml(subdomain)}.${escHtml(hostSuffix)}`;
  return `
    <span class="l-tenant-cell">
      <span class="l-tenant-cell__name">${name}</span>
      <span class="l-tenant-cell__sub">${host}</span>
    </span>
  `;
}
