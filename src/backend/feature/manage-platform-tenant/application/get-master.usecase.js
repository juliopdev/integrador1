/**
 * Fábrica para el caso de uso que resuelve al usuario Master de un tenant (rol category='master')
 * desde su `tenant.db`. Devuelve `{ id, email, status } | null`. El status distingue `invited`
 * (invitación pendiente → habilita "reenviar invitación") de `active`. Lanza si el `tenant.db`
 * no es legible (bug/corrupción) — el llamador lo captura y lo distingue de "no hay master aún".
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.onboardingRepository - Repositorio de onboarding conectado al `tenant.db`.
 * @returns {() => ({ id: string, email: string, status: string } | null)}
 */
export function makeGetMaster({ onboardingRepository }) {
  /**
   * Obtiene los datos del Master del tenant.
   * @returns {({ id: string, email: string, status: string } | null)} Datos del Master o `null` si no existe.
   */
  return function getMaster() {
    return onboardingRepository.findMaster();
  };
}
