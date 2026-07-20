import { summarizeContractChanges } from '../domain/summarize-contract-changes.js';

/**
 * Estado del asistente No-Code para un tenant: función pura de lo ya persistido en `tenant.db`
 * (`tenant_providers` + `backend_contracts` + `roles`). No hay estado paralelo — el "paso actual"
 * es la consecuencia natural del progreso. Decisión documentada en
 * `.doc/tree/src/backend/feature/manage-platform-backend.md`.
 *
 * Reglas de derivación (respetan el orden del asistente descrito en no-code.md):
 * - contrato publicado → `finish` (siempre gana; el asistente ya se completó antes)
 * - sin proveedores linkeados → `provider`
 * - proveedores linkeados, sin contrato publicado → `api` (composición del contrato)
 *
 * Los roles no cambian el paso sugerido (son complementarios al contrato), solo se exponen para
 * que la sección `_step-manage-role` liste los ya creados sin abrir el repo desde la vista.
 *
 * @param {{
 *   contractRepository: { getActiveContract: Function },
 *   providerRepository: object,
 *   roleRepository?: { listStaff: Function },
 *   findContractDependencies: (schema: object|null, category: string, provider: string) => Array<object>,
 * }} deps
 *
 * `findContractDependencies` se inyecta (definida en `infrastructure/providers/`).
 * Este feature no la importa directo para respetar el aislamiento: cross-feature va SIEMPRE por
 * el composition root (bootstrap-platform.js), nunca por `import` entre `application/*`.
 *
 * @returns {() => Promise<{hasProviders: boolean, linkedProviders: Object[], publishedContract: Object|null, draftContract: Object|null, backends: Object[], roles: Object[], suggestedStep: string, diffSummary: Object|null, derivedAuth: {enabled: boolean, strategies: string[]}, availableStores: string[], versionMode: string|null, providerUsage: Object}>} Función de caso de uso.
 */
export function makeGetWizardState({ contractRepository, providerRepository, roleRepository, findContractDependencies = () => [] }) {
  /**
   * Obtiene el estado completo del asistente No-Code para un tenant.
   * @returns {Promise<{
   *   hasProviders: boolean,
   *   linkedProviders: Object[],
   *   publishedContract: Object|null,
   *   draftContract: Object|null,
   *   backends: Object[],
   *   roles: Object[],
   *   suggestedStep: string,
   *   diffSummary: Object|null,
   *   derivedAuth: {enabled: boolean, strategies: string[]},
   *   availableStores: string[],
   *   versionMode: string|null,
   *   providerUsage: Object
   * }>} Estado del wizard.
   */
  return async function getWizardState() {
    // `list()` proyecta sin `configValuesJson` (secretos), así la vista lo consume seguro.
    // P6a: solo cuentan los habilitados (deslinkear = enabled 0, la config queda para relinkear).
    const rawList = providerRepository.list ? providerRepository.list() : [];
    const allProviders = Array.isArray(rawList) ? rawList : [];
    const linkedProviders = allProviders.filter((p) => p.enabled);
    // Fallback `hasAny` para repos acotados de tests que no implementan list().
    const hasProviders = linkedProviders.length > 0
      ? true
      : (!Array.isArray(rawList) && Boolean(providerRepository.hasAny && providerRepository.hasAny()));
    const publishedContract = contractRepository.getActiveContract();
    // Contrato en construcción (`status='draft'`) del asistente No-Code — es el borrador del
    // `nextVersion` que se compone en el paso `_step-manage-api`. Puede no existir todavía.
    const draftContract = contractRepository.getDraft ? contractRepository.getDraft() : null;
    // Historial de versiones (proyección slim: version + status + publishedAt, sin schema_json).
    // Sirve al paso `_step-manage-version-backend` para listar versiones y sugerir la siguiente.
    const backends = contractRepository.list ? contractRepository.list() : [];
    // Roles opcionales: si el repo no está inyectado (tests unit acotados), degrada a lista vacía.
    const roles = roleRepository?.listStaff ? roleRepository.listStaff() : [];

    // "Componer" abre en el paso donde quedó el draft (si lo hay) o en el hub del Paso 1.
    // role/ws son omitibles: no bloquean la derivación.
    //
    // Iter UX P1.5: sin draft — SIEMPRE Paso 1 (Versión), tanto si hay publicado como si no.
    // El Paso 1 es un hub de decisión (editar vN / upgradear a vN+1 / activar del historial);
    // llevar al operador al Paso 7 sin draft era un legacy del flujo anterior — mostraba el
    // "estado del contrato publicado" como si fuera parte del wizard, lo cual confundía porque
    // los pasos previos aparecían marcados como done sobre información que era del publicado,
    // no del draft. Con el rediseño de C, el Paso 1 es el punto de entrada correcto.
    let suggestedStep;
    const dSchema = draftContract?.schema;
    if (publishedContract && !draftContract) {
      suggestedStep = 'finish';
    } else if (!draftContract) {
      suggestedStep = 'version';
    } else if (!dSchema?.versionMode) {
      suggestedStep = 'version';
    } else if (!hasProviders) {
      suggestedStep = 'provider';
    } else if ((dSchema.resources || []).length === 0) {
      suggestedStep = 'api';
    } else if (!(dSchema.resources || []).some((r) => (r.fields || []).length > 0)) {
      suggestedStep = 'data';
    } else {
      suggestedStep = 'finish';
    }

    // Iter 32 F: diff sintético draft vs published para el mini-diff pre-publicar en `_step-finish`.
    // Null si no hay draft (nada por publicar).
    const diffSummary = summarizeContractChanges({
      draftSchema: draftContract?.schema || null,
      publishedSchema: publishedContract?.schema || null,
    });

    // P6a: auth de Users DERIVADA de los providers auth linkeados (no-code.md §7). El asistente
    // la muestra como estado, nunca como formulario; se materializa en el contrato al publicar.
    const authProviders = linkedProviders.filter((p) => p.category === 'auth');
    const derivedAuth = {
      enabled: authProviders.length > 0,
      strategies: authProviders.map((p) => p.provider),
    };

    // P6a/P6c: stores elegibles = providers database linkeados (gatea el select del paso 4).
    const dbProviders = new Set(linkedProviders.filter((p) => p.category === 'database').map((p) => p.provider));
    const availableStores = [
      ...(dbProviders.has('neon') ? ['sql'] : []),
      ...(dbProviders.has('mongodb-atlas') ? ['nosql'] : []),
    ];

    // P6d: modo de versionado elegido en el paso 1 (edit | upgrade), si el draft lo persiste.
    const versionMode = draftContract?.schema?.versionMode ?? null;

    // Capa 3 (auditoría de deslinkeo): preview del impacto por provider linkeado. Para cada
    // provider habilitado calculamos qué del contrato publicado y del draft depende de él, para
    // que la vista renderice "N del publicado v3, M del draft" bajo cada card ANTES de que el
    // operador dispare "Deslinkear". Sin esto, sólo se enteraba del impacto después del error 422.
    const providerUsage = {};
    for (const p of linkedProviders) {
      const key = `${p.category}::${p.provider}`;
      providerUsage[key] = {
        published: findContractDependencies(publishedContract?.schema, p.category, p.provider),
        draft: findContractDependencies(draftContract?.schema, p.category, p.provider),
        publishedVersion: publishedContract?.version ?? null,
      };
    }

    return { hasProviders, linkedProviders, publishedContract, draftContract, backends, roles, suggestedStep, diffSummary, derivedAuth, availableStores, versionMode, providerUsage };
  };
}
