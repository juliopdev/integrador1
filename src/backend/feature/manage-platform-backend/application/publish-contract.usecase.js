import { validateContract } from '../domain/contract.schema.js';

/**
 * Valida el contrato (gramática) y lo publica como versión activa en `backend_contracts` del
 * tenant. (La compilación del esquema físico + Zod + OpenAPI y la migración por `field.id` son los
 * incrementos C–F.) Ver no-code.md.
 *
 * @param {{ contractRepository: object, now?: () => number }} deps
 * @returns {(params: { contract: Object }) => Promise<{version: string, contract: Object}>} Función de caso de uso.
 */
export function makePublishContract({ contractRepository, now = () => Date.now() }) {
  /**
   * Valida el contrato y lo publica como versión activa en backend_contracts del tenant.
   * @param {Object} params
   * @param {Object} params.contract - Contrato a publicar (validado con contract.schema).
   * @returns {Promise<{version: string, contract: Object}>} Versión publicada + contrato validado.
   * @throws {DomainError} INVALID_CONTRACT
   */
  return async function publishContract({ contract }) {
    const valid = validateContract(contract); // DomainError INVALID_CONTRACT si falla
    contractRepository.publish({ version: valid.version, schemaJson: JSON.stringify(valid), now: now() });
    return { version: valid.version, contract: valid };
  };
}
