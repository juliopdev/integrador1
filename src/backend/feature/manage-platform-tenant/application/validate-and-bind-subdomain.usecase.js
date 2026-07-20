import { DomainError } from '../../../common/errors.js';
import { uuidv7 } from '../../../common/id.js';

// Etiqueta DNS válida: 3–63 chars, minúsculas alfanuméricas y guiones, sin guion al inicio/fin.
const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;

// Subdominios reservados por el sistema (colisionan con apex/servicios/rutas).
const RESERVED = new Set([
  'www', 'api', 'app', 'admin', 'dashboard', 'mail', 'smtp', 'ftp',
  'static', 'assets', 'cdn', 'status', 'blog', 'help', 'support', 'docs', 'ns1', 'ns2',
]);

/**
 * Fábrica para el caso de uso que valida y reserva un subdominio en la plataforma.
 * Comprueba que el subdominio cumpla el formato DNS, no coincida con términos reservados
 * y no esté en uso. Si todo es correcto, registra el tenant en estado `pending`.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.tenantRepository - Repositorio de tenants de plataforma.
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @returns {(params: { subdomain: string, projectName?: string|null }) => Promise<{ tenantId: string, subdomain: string }>}
 * @throws {DomainError} `INVALID_SUBDOMAIN` — si el formato no es válido.
 * @throws {DomainError} `RESERVED_SUBDOMAIN` — si el subdominio está reservado.
 * @throws {DomainError} `SUBDOMAIN_TAKEN` — si el subdominio ya está en uso.
 */
export function makeValidateAndBindSubdomain({ tenantRepository, now = () => Date.now() }) {
  /**
   * Valida el formato, verifica disponibilidad y registra el tenant en estado `pending`.
   * @param {Object} params - Parámetros de validación.
   * @param {string} params.subdomain - Subdominio a validar y reservar.
   * @param {string|null} [params.projectName=null] - Nombre visible del proyecto (default: el subdominio).
   * @returns {Promise<{ tenantId: string, subdomain: string }>}
   * @throws {DomainError} `INVALID_SUBDOMAIN` | `RESERVED_SUBDOMAIN` | `SUBDOMAIN_TAKEN`
   */
  return async function validateAndBindSubdomain({ subdomain, projectName = null }) {
    const normalized = String(subdomain ?? '').trim().toLowerCase();

    if (normalized.length < 3 || !SUBDOMAIN_RE.test(normalized)) {
      throw new DomainError('INVALID_SUBDOMAIN', 'El subdominio tiene caracteres inválidos o una longitud incorrecta.');
    }
    if (RESERVED.has(normalized)) {
      throw new DomainError('RESERVED_SUBDOMAIN', 'Ese subdominio está reservado por el sistema.');
    }
    if (await tenantRepository.findBySubdomain(normalized)) {
      throw new DomainError('SUBDOMAIN_TAKEN', 'El subdominio ya está en uso.');
    }

    const tenantId = uuidv7();
    const ts = now();
    // P2: projectName = nombre visible de la web (default: el propio subdominio).
    await tenantRepository.insertTenant({
      id: tenantId,
      subdomain: normalized,
      projectName: projectName || normalized,
      status: 'pending',
      now: ts,
    });
    tenantRepository.insertStatusEvent({ id: uuidv7(), tenantId, event: 'created', now: ts });
    return { tenantId, subdomain: normalized };
  };
}
