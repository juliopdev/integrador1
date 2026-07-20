import { join } from 'node:path';
import { platformDb } from '../config/database/platform/sqlite-platform.js';
import { platformUsers, authTokens } from '../config/drizzle/schema-platform.js';
import { tenantUsers, authTokens as tenantAuthTokens } from '../config/drizzle/schema-tenant.js';
import { createAdminRepository } from '../feature/auth-admin/infrastructure/admin.repository.js';
import { makeRegisterAdminCredentials } from '../feature/auth-admin/application/register-admin-credentials.usecase.js';
import { makeLogin } from '../feature/auth-admin/application/login.usecase.js';
import { makeAdminForgotPass } from '../feature/auth-admin/application/forgot-pass.usecase.js';
import { makeAdminResetPass } from '../feature/auth-admin/application/reset-pass.usecase.js';
import { registerAuthAdminRoutes } from '../feature/auth-admin/presentation/routes/api.handler.js';
import { registerAuthAdminViews } from '../feature/auth-admin/presentation/routes/view.handler.js';
import { registerSessionAuth } from './hooks/session-auth.hook.js';
import { hashSecret, verifySecret } from '../common/password.js';
import { migrateTenant } from '../config/drizzle/migrator.js';
import { sendMail } from '../infrastructure/providers/mail.adapter.js';
import { createSession, getSession, destroySession } from '../infrastructure/providers/session.adapter.js';
import { env } from '../config/env.js';
import { createTenantRepository } from '../feature/manage-platform-tenant/infrastructure/tenant.repository.js';
import { createTenantOnboardingRepository } from '../feature/manage-platform-tenant/infrastructure/tenant-onboarding.repository.js';
import { makeValidateAndBindSubdomain } from '../feature/manage-platform-tenant/application/validate-and-bind-subdomain.usecase.js';
import { makeProvisionTenantDb } from '../feature/manage-platform-tenant/application/provision-tenant-db.usecase.js';
import { makeRegisterTenantMaster } from '../feature/manage-platform-tenant/application/register-tenant-master.usecase.js';
import { makeSendMasterWelcomeEmail } from '../feature/manage-platform-tenant/application/send-master-welcome-email.usecase.js';
import { makeGetTenants } from '../feature/manage-platform-tenant/application/get-tenants.usecase.js';
import { makeGetTenantById } from '../feature/manage-platform-tenant/application/get-tenant-by-id.usecase.js';
import { makeListPlans } from '../feature/manage-platform-tenant/application/list-plans.usecase.js';
import { makeSetTenantStatus } from '../feature/manage-platform-tenant/application/set-tenant-status.usecase.js';
import { makeDeleteTenant } from '../feature/manage-platform-tenant/application/delete-tenant.usecase.js';
import { makeProvisionNewTenant } from '../feature/manage-platform-tenant/application/provision-new-tenant.usecase.js';
import { makeGetMaster } from '../feature/manage-platform-tenant/application/get-master.usecase.js';
import { makeUpdateTenant } from '../feature/manage-platform-tenant/application/update-tenant.usecase.js';
import { makeRegenerateActivationToken } from '../feature/manage-platform-tenant/application/regenerate-activation-token.usecase.js';
import { makeResendMasterInvitation } from '../feature/manage-platform-tenant/application/resend-master-invitation.usecase.js';
import { registerManagePlatformTenantRoutes } from '../feature/manage-platform-tenant/presentation/routes/api.handler.js';
import { registerManagePlatformTenantViews } from '../feature/manage-platform-tenant/presentation/routes/view.handler.js';
import { makeLinkTenantProvider } from '../feature/manage-platform-provider/application/link-tenant-provider.usecase.js';
import { makeUnlinkTenantProvider } from '../feature/manage-platform-provider/application/unlink-tenant-provider.usecase.js';
import { makeUpdateProviderSettings } from '../feature/manage-platform-provider/application/update-provider-settings.usecase.js';
import { registerManageProviderRoutes } from '../feature/manage-platform-provider/presentation/routes/api.handler.js';
import { materializeDerivedAuth } from '../infrastructure/providers/materialize-derived-auth.js';
import { makeCompileAccessToRoles } from '../feature/manage-platform-role/application/compile-access-to-roles.usecase.js';
import { makePublishContract } from '../feature/manage-platform-backend/application/publish-contract.usecase.js';
import { makeActivateVersion } from '../feature/manage-platform-backend/application/activate-version.usecase.js';
import { makeDeleteVersion } from '../feature/manage-platform-backend/application/delete-version.usecase.js';
import { makeConfigureRolePermissions } from '../feature/manage-platform-role/application/configure-role-permissions.usecase.js';
import { makeDeleteRole } from '../feature/manage-platform-role/application/delete-role.usecase.js';
import { registerManageRoleRoutes } from '../feature/manage-platform-role/presentation/routes/api.handler.js';
import { makeGetBackends, makeGetBackendDetail } from '../feature/manage-platform-backend/application/get-backends.usecase.js';
import { makeDeleteBackend, makeToggleApiAuth, makeToggleWsChannel } from '../feature/manage-platform-backend/application/update-backend.usecase.js';
import { makeCompileBackend } from '../feature/manage-platform-backend/application/compile-backend.usecase.js';
import { makeGetWizardState } from '../feature/manage-platform-backend/application/get-wizard-state.usecase.js';
import { findContractDependencies } from '../infrastructure/providers/find-contract-dependencies.js';
import { makeGetBackendStatus } from '../feature/manage-platform-backend/application/get-backend-status.usecase.js';
import { makeAddDraftResource } from '../feature/manage-platform-backend/application/add-draft-resource.usecase.js';
import { makeDeleteDraftResource } from '../feature/manage-platform-backend/application/delete-draft-resource.usecase.js';
import { makeUpdateDraftResource } from '../feature/manage-platform-backend/application/update-draft-resource.usecase.js';
import { makeStartDraft } from '../feature/manage-platform-backend/application/start-draft.usecase.js';
import { makeAbortDraft } from '../feature/manage-platform-backend/application/abort-draft.usecase.js';
import { makeAddDraftField } from '../feature/manage-platform-backend/application/add-draft-field.usecase.js';
import { makeDeleteDraftField } from '../feature/manage-platform-backend/application/delete-draft-field.usecase.js';
import { makeAddDraftEndpoint } from '../feature/manage-platform-backend/application/add-draft-endpoint.usecase.js';
import { makeDeleteDraftEndpoint } from '../feature/manage-platform-backend/application/delete-draft-endpoint.usecase.js';
import { makeUpdateDraftAuth } from '../feature/manage-platform-backend/application/update-draft-auth.usecase.js';
import { makeGenerateApiKey } from '../feature/manage-platform-apikey/application/generate-api-key.usecase.js';
import { makeGetApiKeyStatus } from '../feature/manage-platform-apikey/application/get-api-key-status.usecase.js';
import { registerManageApikeyRoutes } from '../feature/manage-platform-apikey/presentation/routes/api.handler.js';
import { resolveStore } from '../infrastructure/no-code/store-resolver.js';
import { createContractRepository } from '../infrastructure/no-code/contract.repository.js';
import { diffResources } from '../infrastructure/no-code/contract-diff.js';
import { registerManageBackendRoutes } from '../feature/manage-platform-backend/presentation/routes/api.handler.js';
import { registerManageBackendViews } from '../feature/manage-platform-backend/presentation/routes/view.handler.js';
import { createDeployRepository } from '../feature/manage-platform-frontend/infrastructure/deploy.repository.js';
import { createCaddyProxyAdapter } from '../feature/manage-platform-frontend/infrastructure/caddy-proxy.adapter.js';
import { createFsAdapter } from '../infrastructure/providers/fs.adapter.js';
import { makeGetFrontendDeploys } from '../feature/manage-platform-frontend/application/get-frontend-deploys.usecase.js';
import { makeGetFrontendDeploy } from '../feature/manage-platform-frontend/application/get-frontend-deploy.usecase.js';
import { makeSetExternalRedirect } from '../feature/manage-platform-frontend/application/set-external-redirect.usecase.js';
import { makeSetHostedDeploy } from '../feature/manage-platform-frontend/application/set-hosted-deploy.usecase.js';
import { makeDeleteFrontendDeploy } from '../feature/manage-platform-frontend/application/delete-frontend-deploy.usecase.js';
import { registerManageFrontendRoutes } from '../feature/manage-platform-frontend/presentation/routes/api.handler.js';
import { registerManageFrontendViews } from '../feature/manage-platform-frontend/presentation/routes/view.handler.js';
import { createHealthRepository } from '../feature/manage-platform-health/infrastructure/health.repository.js';
import { createSystemMetricsAdapter } from '../feature/manage-platform-health/infrastructure/system-metrics.adapter.js';
import { makeGetPlatformHealth } from '../feature/manage-platform-health/application/get-platform-health.usecase.js';
import { registerPlatformHealthApi } from '../feature/manage-platform-health/presentation/routes/api.handler.js';
import { registerPlatformHealthViews } from '../feature/manage-platform-health/presentation/routes/view.handler.js';
import { createLogRepository } from '../feature/manage-platform-log/infrastructure/log.repository.js';
import { configureLogRecorder, logEventBus } from '../feature/manage-platform-log/infrastructure/platform-log-recorder.js';
import { makeGetLogs } from '../feature/manage-platform-log/application/get-logs.usecase.js';
import { registerPlatformLogViews } from '../feature/manage-platform-log/presentation/routes/view.handler.js';
import { registerPlatformLogApi } from '../feature/manage-platform-log/presentation/routes/api.handler.js';
import { makeOAuthLogin } from '../feature/auth-user/application/oauth-login.usecase.js';
import { makeGoogleCallback } from '../feature/auth-user/presentation/routes/oauth.handler.js';
import { createGoogleOAuthAdapter } from '../infrastructure/providers/google-oauth.adapter.js';
import { registerStripeWebhookRoute } from '../feature/manage-platform-provider/presentation/routes/stripe-webhook.handler.js';

// ── Manage Admin Dashboard Feature ───────────────────────────────────
import { createDashboardRepository } from '../feature/manage-admin-dashboard/infrastructure/dashboard.repository.js';
import { makeGetDashboardData } from '../feature/manage-admin-dashboard/application/get-dashboard-data.usecase.js';
import { makeGetSuperadminWidgets } from '../feature/manage-admin-dashboard/application/get-superadmin-widgets.usecase.js';
import { makeGetTenantWidgets } from '../feature/manage-admin-dashboard/application/get-tenant-widgets.usecase.js';
import { registerDashboardViews } from '../feature/manage-admin-dashboard/presentation/routes/view.handler.js';
import { resolveUserRoleCategories } from '../feature/manage-master-staff/domain/resolve-user-role-categories.js';

// ── Composition root: proveedores del kernel (bootstrap/) ────────────
import { testConnection, invalidateSubdomainCache, publishControlEvent } from './bootstrap/platform-providers.js';
import { createTenantProviders } from './bootstrap/tenant-providers.js';

/**
 * Inicializador y orquestador del portal de la plataforma y el panel del Superadmin (dominio apex).
 * Actúa como Composition Root para las funcionalidades de la plataforma, componiendo repositorios,
 * adaptadores e inyectándolos en las fábricas de casos de uso correspondientes. Registra las rutas de la
 * API de sistema (`/api-system/v1`) y las vistas SSR del dashboard (`/dashboard`) para el contexto global.
 * 
 * @param {import('fastify').FastifyInstance} app - Instancia del servidor Fastify.
 * @returns {Promise<void>}
 */
export async function bootstrapPlatform(app) {
  // Fábricas por-tenant sobre el pool LRU (un solo lugar sabe abrir `<tenantId>.db`).
  const t = createTenantProviders(app);

  // auth-admin sirve DOS contextos según `request.tenant`: Superadmin (apex) y Master/Staff (subdominio).
  // Plataforma se compone una vez (platformDb es singleton); tenant se compone por petición sobre request.db.
  const makeAuthUseCases = (adminRepository, scope, isActive, subdomain) => ({
    registerAdminCredentials: makeRegisterAdminCredentials({ adminRepository, hasher: { hash: hashSecret } }),
    login: makeLogin({ adminRepository, verifier: { verify: verifySecret }, scope, isActive }),
    forgotPass: makeAdminForgotPass({
      adminRepository, mailer: { sendMail }, appBaseUrl: env.APP_URL, subdomain,
    }),
    resetPass: makeAdminResetPass({ adminRepository, hasher: { hash: hashSecret } }),
  });

  // Superadmin: sin `status` — está "activo" cuando ya definió password. El repo usa isActive
  // por default (`Boolean(u.passwordHash)`), coincide con el predicado del login.
  const platformAdminRepo = createAdminRepository({ db: platformDb, users: platformUsers, authTokens });
  const platformContext = {
    scope: 'platform',
    cookieName: 'platform_sid',
    tenantId: null,
    ...makeAuthUseCases(platformAdminRepo, 'platform', (u) => Boolean(u.passwordHash), null),
  };

  const resolveAuthContext = (request) => {
    if (!request.tenant) return platformContext;
    // Master/Staff exigen `status='active'` para reset — así un `invited`/`suspended` no dispara correo.
    const repo = createAdminRepository({
      db: request.db, users: tenantUsers, authTokens: tenantAuthTokens,
      activatesStatus: true, isActive: (u) => u.status === 'active',
    });
    return {
      scope: 'tenant',
      cookieName: 'tenant_sid',
      tenantId: request.tenant.id,
      ...makeAuthUseCases(repo, 'tenant', (u) => u.status === 'active', request.tenant.subdomain),
    };
  };

  // P8.3b: Webhook de Stripe — DEBE ir ANTES de registerSessionAuth para que el hook
  // preValidation de sesión NO se aplique a esta ruta. El webhook es invocado por los
  // servidores de Stripe (sin sesión), y la autenticación se hace via firma HMAC del body.
  registerStripeWebhookRoute(app, { logger: app.log });

  // Hidrata request.user desde la cookie/Bearer (ámbito según request.tenant). Debe ir ANTES de las rutas.
  registerSessionAuth(app);

  // auth-admin: activación + login + refresh + logout + me (contexto resuelto por petición).
  registerAuthAdminRoutes(app, { resolveContext: resolveAuthContext, session: { create: createSession, get: getSession, destroy: destroySession } });
  registerAuthAdminViews(app); // SSR: /dashboard/login

  // manage-platform-tenant (Fase 2): alta de tenants.
  const tenantRepository = createTenantRepository({ db: platformDb });
  const getTenants = makeGetTenants({ tenantRepository });
  const getTenantById = makeGetTenantById({ tenantRepository });
  const listPlans = makeListPlans({ tenantRepository });
  const setTenantStatus = makeSetTenantStatus({
    tenantRepository,
    publishControlEvent,
    invalidateSubdomainCache,
    logger: app.log,
  });
  const deleteTenant = makeDeleteTenant({ tenantRepository, invalidateSubdomainCache, publishControlEvent, logger: app.log });

  // Envío de bienvenida/activación del Master — compartido por el alta y el reenvío de invitación.
  const sendWelcome = makeSendMasterWelcomeEmail({ mailer: { sendMail }, appBaseUrl: env.APP_URL });

  const provisionNewTenant = makeProvisionNewTenant({
    validateAndBindSubdomain: makeValidateAndBindSubdomain({ tenantRepository }),
    provisionTenantDb: makeProvisionTenantDb({ migrateTenant }),
    registerMasterFor: (tenantId) =>
      makeRegisterTenantMaster({
        repository: createTenantOnboardingRepository({ db: t.dbFor(tenantId) }),
      }),
    sendWelcome,
    tenantRepository,
  });

  const updateTenant = makeUpdateTenant({ tenantRepository });
  const resendMasterInvitation = makeResendMasterInvitation({
    tenantRepository,
    regenerateTokenFor: (tenantId) =>
      makeRegenerateActivationToken({ onboardingRepository: createTenantOnboardingRepository({ db: t.dbFor(tenantId) }) }),
    sendWelcome,
  });

  registerManagePlatformTenantRoutes(app, {
    provisionNewTenant,
    setTenantStatus,
    deleteTenant,
    updateTenant,
    resendMasterInvitation,
  });
  registerManagePlatformTenantViews(app, {
    getTenants,
    getTenantById,
    listPlans,
    getMasterFor: (tenantId) => {
      const repo = createTenantOnboardingRepository({ db: t.dbFor(tenantId) });
      return makeGetMaster({ onboardingRepository: repo });
    },
  });

  // manage-platform-backend (Fase 4): el Superadmin autora el backend No-Code del tenant elegido.
  registerManageBackendViews(app, {
    getTenants,
    getTenantById,
    // Estado derivado del wizard: se compone por petición sobre el tenant elegido (LRU pool).
    makeGetWizardStateFor: (tenantId) =>
      makeGetWizardState({
        contractRepository: t.contractRepositoryFor(tenantId),
        providerRepository: t.providerRepositoryFor(tenantId),
        roleRepository: t.roleRepositoryFor(tenantId),
        // Cross-feature: la resuelve el composition root (regla del split P8 — features no
        // importan entre sí en application/*). El helper es puro, sin estado ni deps.
        findContractDependencies,
      }),
    // Iteration 30 (A): estado por tenant para el chip del listado `/dashboard/backends`.
    makeGetBackendStatusFor: (tenantId) =>
      makeGetBackendStatus({ contractRepository: t.contractRepositoryFor(tenantId) }),
    // Iteration 30 (C): detalle read-only del contrato publicado/retirado (reusa el use case
    // `getBackendDetail` que devuelve el schema JSON parseado).
    makeGetBackendDetailFor: (tenantId) =>
      makeGetBackendDetail({ contractRepository: t.contractRepositoryFor(tenantId) }),
    // P5: estado de la API key para la columna Keys del listado.
    makeGetApiKeyStatusFor: (tenantId) =>
      makeGetApiKeyStatus({ apiKeyRepository: t.apiKeyRepositoryFor(tenantId) }),
  });
  // Publicar = validar + persistir + **compilar** (crear tablas nuevas, migrar las existentes por
  // field.id). Extraída fuera del `registerManageBackendRoutes` para poder reusarla desde
  // `makeActivateVersionFor` (activar versión histórica del historial reutiliza esta pipeline
  // completa: materialize auth + publish + compileAccess + compile DDL).
  const buildPublishContractFor = (tenantId) => {
    const tenantDb = t.dbFor(tenantId);
    const contractRepository = t.contractRepositoryFor(tenantId);
    const providerRepository = t.providerRepositoryFor(tenantId);
    const roleRepository = t.roleRepositoryFor(tenantId);
    const publish = makePublishContract({ contractRepository });
    const compile = makeCompileBackend({ resolveStore, tenantId, tenantDb, diffResources });
    const compileAccess = makeCompileAccessToRoles({ roleRepository });
    return async ({ contract }) => {
      // P6b: materializa la auth DERIVADA de los providers linkeados (si hay) + redirects por
      // convención — el snapshot queda auto-contenido. Sin providers auth ⇒ contrato intacto (v1).
      const tenant = tenantRepository.findById(tenantId);
      const materialized = materializeDerivedAuth({
        contract,
        linkedProviders: providerRepository.list(),
        subdomain: tenant?.subdomain ?? tenantId,
        appUrl: env.APP_URL,
      });
      const previous = contractRepository.getActiveContract(); // ANTES de publicar (para el diff)
      const result = await publish({ contract: materialized });
      // P6b: una sola fuente de autorado — access del snapshot se compila a roles.permissions_json.
      compileAccess({ contract: result.contract });
      await compile({ previous: previous?.schema, current: result.contract });
      return result;
    };
  };

  registerManageBackendRoutes(app, {
    getTenantById,
    makePublishContractFor: buildPublishContractFor,
    // Iter UX: activar una versión existente del historial (rollback / roll-forward). El use case
    // lee el `schema_json` de la versión pedida y lo pasa por la misma `publishContract` pipeline.
    makeActivateVersionFor: (tenantId) => {
      const contractRepository = t.contractRepositoryFor(tenantId);
      const publishContract = buildPublishContractFor(tenantId);
      return makeActivateVersion({ contractRepository, publishContract });
    },
    // Iter UX P2.4: eliminar una versión retirada del historial. Rechaza activa/draft.
    makeDeleteVersionFor: (tenantId) => makeDeleteVersion({ contractRepository: t.contractRepositoryFor(tenantId) }),
    makeContractOpsFor: (tenantId) => {
      const contractRepository = t.contractRepositoryFor(tenantId);
      return {
        getBackends: makeGetBackends({ contractRepository }),
        getBackendDetail: makeGetBackendDetail({ contractRepository }),
        deleteBackend: makeDeleteBackend({ contractRepository }),
        toggleApiAuth: makeToggleApiAuth({ contractRepository }),
        toggleWsChannel: makeToggleWsChannel({ contractRepository }),
      };
    },
    // Draft del asistente No-Code (paso `_step-manage-api`): agrega resources al draft persistido
    // como `backend_contracts` con `status='draft'`.
    makeAddDraftResourceFor: (tenantId) =>
      makeAddDraftResource({ contractRepository: t.contractRepositoryFor(tenantId) }),
    makeDeleteDraftResourceFor: (tenantId) =>
      makeDeleteDraftResource({ contractRepository: t.contractRepositoryFor(tenantId) }),
    makeUpdateDraftResourceFor: (tenantId) =>
      makeUpdateDraftResource({ contractRepository: t.contractRepositoryFor(tenantId) }),
    // P7 (paso 1 v2): iniciar borrador con modo editar/upgradear. Snapshotea `tenant_providers`
    // en el draft para poder revertir los linkeos hechos durante la edición si el operador aborta.
    makeStartDraftFor: (tenantId) =>
      makeStartDraft({
        contractRepository: t.contractRepositoryFor(tenantId),
        providerRepository: t.providerRepositoryFor(tenantId),
      }),
    // "Reiniciar" (abortar) el draft: restaura providers al snapshot y elimina la fila del draft.
    // NO se usa para la limpieza post-publish — ver `deleteDraftFor` (esa NO restaura, porque el
    // contrato recién publicado depende de los providers que se linkearon).
    makeAbortDraftFor: (tenantId) =>
      makeAbortDraft({
        contractRepository: t.contractRepositoryFor(tenantId),
        providerRepository: t.providerRepositoryFor(tenantId),
        logger: app.log,
      }),
    // Draft (sub-slice a-2): fields por resource.
    makeDraftFieldOpsFor: (tenantId) => {
      const contractRepository = t.contractRepositoryFor(tenantId);
      return {
        addField: makeAddDraftField({ contractRepository }),
        deleteField: makeDeleteDraftField({ contractRepository }),
      };
    },
    // Draft (sub-slice a-3): endpoints.
    makeDraftEndpointOpsFor: (tenantId) => {
      const contractRepository = t.contractRepositoryFor(tenantId);
      return {
        addEndpoint: makeAddDraftEndpoint({ contractRepository }),
        deleteEndpoint: makeDeleteDraftEndpoint({ contractRepository }),
      };
    },
    // Draft (sub-slice a-4): auth de Users.
    makeUpdateDraftAuthFor: (tenantId) =>
      makeUpdateDraftAuth({ contractRepository: t.contractRepositoryFor(tenantId) }),
    // Iter 32 E: descartar draft POST-PUBLISH (no restaura providers — el contrato ya publicado
    // depende de ellos). Para el flujo "Reiniciar" desde la UI, ver `makeAbortDraftFor` arriba.
    deleteDraftFor: (tenantId) => async () => {
      const contractRepository = t.contractRepositoryFor(tenantId);
      const existing = contractRepository.getDraft?.();
      if (!existing) return { deleted: false };
      contractRepository.deleteDraft(existing.version);
      return { deleted: true };
    },
  });

  // manage-platform-provider (split de features, P8): linkeo de proveedores externos por tenant.
  // Insumo del contrato No-Code — el ciclo de vida es independiente del wizard, y las guardas
  // contra deslinkeo destructivo viven en el propio use case (ver P8 doc).
  registerManageProviderRoutes(app, {
    getTenantById,
    makeLinkProviderFor: (tenantId) =>
      makeLinkTenantProvider({ providerRepository: t.providerRepositoryFor(tenantId), testConnection }),
    makeUnlinkProviderFor: (tenantId) =>
      makeUnlinkTenantProvider({
        providerRepository: t.providerRepositoryFor(tenantId),
        contractRepository: t.contractRepositoryFor(tenantId),
      }),
    makeUpdateSettingsFor: (tenantId) =>
      makeUpdateProviderSettings({ providerRepository: t.providerRepositoryFor(tenantId) }),
  });

  // manage-platform-role (split de features, P8): RBAC del tenant. Concern separado del contrato
  // — los roles se autor(iz)an cuando el Master los asigna; el contrato solo los referencia.
  registerManageRoleRoutes(app, {
    getTenantById,
    makeConfigureRoleFor: (tenantId) =>
      makeConfigureRolePermissions({ roleRepository: t.roleRepositoryFor(tenantId) }),
    makeDeleteRoleFor: (tenantId) =>
      makeDeleteRole({ roleRepository: t.roleRepositoryFor(tenantId) }),
  });

  // manage-platform-apikey (split de features, P8): API key "frontend" del tenant. Concern
  // ortogonal al contrato No-Code — su ciclo de vida no depende del wizard.
  registerManageApikeyRoutes(app, {
    getTenantById,
    makeApiKeyOpsFor: (tenantId) => {
      const apiKeyRepository = t.apiKeyRepositoryFor(tenantId);
      return {
        generate: makeGenerateApiKey({ apiKeyRepository }),
        status: makeGetApiKeyStatus({ apiKeyRepository }),
      };
    },
  });

  // manage-platform-frontend (Fase 2, retomado): Superadmin configura el frontend de cada tenant.
  // Slice A: sólo modo externo (URL redirect) + CRUD. Slice B (ZIP upload + Caddy real + SSE) se
  // implementará cuando se necesite hostear frontends internos.
  const deployRepository = createDeployRepository({ db: platformDb });
  const caddyProxy = createCaddyProxyAdapter();
  const getFrontendDeploys = makeGetFrontendDeploys({ deployRepository });
  const getFrontendDeploy = makeGetFrontendDeploy({ deployRepository, tenantRepository });
  const setExternalRedirect = makeSetExternalRedirect({ deployRepository, tenantRepository, caddyProxy, logger: app.log, invalidateSubdomainCache });
  const frontendsDir = join(process.cwd(), 'data', 'frontends');
  const fsAdapter = createFsAdapter();
  const setHostedDeploy = makeSetHostedDeploy({ deployRepository, tenantRepository, fsAdapter, frontendsDir, invalidateSubdomainCache });
  const deleteFrontendDeploy = makeDeleteFrontendDeploy({ deployRepository, tenantRepository, caddyProxy, logger: app.log, invalidateSubdomainCache });
  registerManageFrontendRoutes(app, { getDeploys: getFrontendDeploys, setExternalRedirect, setHostedDeploy, deleteFrontendDeploy });
  registerManageFrontendViews(app, {
    getDeploys: getFrontendDeploys,
    getDeployFor: (tenantId) => getFrontendDeploy({ tenantId }),
  });

  // manage-platform-health (Fase 7): snapshot de métricas VPS + plataforma. Slice A: polling SSR;
  // Slice B agregará SSE stream para live-charts.
  const healthRepository = createHealthRepository({ db: platformDb });
  const dataDir = join(process.cwd(), 'data');
  const systemMetrics = createSystemMetricsAdapter();
  const getHealth = makeGetPlatformHealth({
    platformCounts: () => healthRepository.counts(),
    jobsSummary: () => healthRepository.jobsSummary(),
    dataDir,
    tenantsDbDir: env.TENANTS_DB_DIR,
    systemMetrics,
  });
  registerPlatformHealthApi(app, { getHealth });
  registerPlatformHealthViews(app, { getHealth });

  // manage-platform-log (Fase 7): consola de logs de plataforma con filtro + paginación. Slice A:
  // polling SSR sobre `platform_logs_local`; Slice B agregará SSE + archivo a Mongo.
  const logRepository = createLogRepository({ db: platformDb });
  // Inyecta el repo al recorder singleton: a partir de ahora `record(...)` desde cualquier lado
  // persiste + emite en `logEventBus` (consumido por el endpoint SSE del stream de logs).
  configureLogRecorder({ logRepository });
  const getLogs = makeGetLogs({ logRepository });
  registerPlatformLogViews(app, { getLogs });
  registerPlatformLogApi(app, { logEventBus });

  // manage-admin-dashboard: Panel de control unificado (Superadmin/Master/Staff)
  // Iter 53: Superadmin home usa `getSuperadminWidgets` (reusa health + logs + counts). Master/Staff
  // sigue con `getDashboardData` legacy hasta Iter 54.
  const dashboardRepository = createDashboardRepository();
  const getDashboardData = makeGetDashboardData({ dashboardRepository });
  const getSuperadminWidgets = makeGetSuperadminWidgets({
    getHealth, // ya cableado arriba (Fase 7)
    healthRepository, // ahora expone readRecentErrors() y readRecentActivity()
  });
  registerDashboardViews(app, {
    getDashboardData,
    getSuperadminWidgets,
    // Iter 54: per-request factory con el `request.db` del tenant resuelto por `tenant-loader`.
    // El repositorio se reutiliza; el db se pasa por parámetro a cada método.
    getTenantWidgetsFor: (request) => makeGetTenantWidgets({ dashboardRepository, db: request.db }),
    resolveDashboardDb: (request) => (request.tenant ? request.db : platformDb),
    resolveUserRoleCategories: (request) => resolveUserRoleCategories({ db: request.db }, request.user.id),
  });

  const syncUserForTenant = async (tenantId, { userId, email, name }) => {
    try {
      const tenantDb = t.dbFor(tenantId);
      const contractRepo = createContractRepository({ db: tenantDb });
      const activeContract = contractRepo.getActiveContract();
      if (!activeContract) return;

      const userResource = activeContract.schema.resources.find((r) => r.name === 'users');
      if (!userResource) return;

      const store = await resolveStore({
        tenantId,
        tenantDb,
        storeType: userResource.store,
      });

      const emailField = userResource.fields.find((f) => f.name === 'email');
      const nameField = userResource.fields.find((f) => f.name === 'name');

      const payload = {};
      if (emailField) payload.email = email;
      if (nameField) payload.name = name || email.split('@')[0];

      // Iter 2026-07: replicar el shape del dispatcher (dynamic-router.js) — el schema exige
      // created_at/updated_at BIGINT NOT NULL. Antes se omitían y el insert tiraba NOT NULL
      // constraint silenciado por el try/catch → users_db quedaba vacío → checkout falla con
      // FK sobre orders.user_id.
      const now = Date.now();
      const existing = await store.findById(userResource.physicalName, userId);
      if (existing) {
        await store.update(userResource.physicalName, userId, { ...payload, updated_at: now });
      } else {
        await store.insert(userResource.physicalName, {
          id: userId,
          ...payload,
          created_at: now,
          updated_at: now,
        });
      }
    } catch (err) {
      app.log.error({ err }, 'Error syncing OAuth user to dynamic store — checkout will fail with FK constraint');
    }
  };

  // auth-user OAuth callback (Iteration 26): vive en APEX porque Google Cloud solo acepta un
  // `redirect_uri` público por app. El state JWT trae el `tenantId`, así identificamos el tenant
  // sin subdominio y hacemos el upsert contra su `<tenantId>.db`.
  const googleAdapter = createGoogleOAuthAdapter();
  const googleCallback = makeGoogleCallback({
    googleAdapter,
    getTenantById,
    providerLookupById: t.googleAuthConfigFor,
    oauthLoginFor: (tenantId) =>
      makeOAuthLogin({
        userRepository: t.userRepositoryFor(tenantId),
        onLoginSuccess: async ({ userId, email, name }) => {
          await syncUserForTenant(tenantId, { userId, email, name });
        },
      }),
    appUrl: env.APP_URL,
  });
  app.get('/auth/google/callback', googleCallback);
}
