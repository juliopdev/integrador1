import { requireCategory } from './hooks/rbac-validator.hook.js';
import { registerTenantCapabilities } from './hooks/tenant-capabilities.hook.js';
import { createStaffRepository } from '../feature/manage-master-staff/infrastructure/staff.repository.js';
import { makeInviteStaff } from '../feature/manage-master-staff/application/invite-staff.usecase.js';
import { makeGetStaffMembers } from '../feature/manage-master-staff/application/get-staff-members.usecase.js';
import { makeGetStaffRoles } from '../feature/manage-master-staff/application/get-staff-roles.usecase.js';
import { makeUpdateStaffRole } from '../feature/manage-master-staff/application/update-staff-role.usecase.js';
import { makeDeleteStaff } from '../feature/manage-master-staff/application/delete-staff.usecase.js';
import { registerStaffRoutes } from '../feature/manage-master-staff/presentation/routes/api.handler.js';
import { registerStaffViews } from '../feature/manage-master-staff/presentation/routes/view.handler.js';
import { resolveUserRoleCategories } from '../feature/manage-master-staff/domain/resolve-user-role-categories.js';
import { sendMail } from '../infrastructure/providers/mail.adapter.js';
import { sendUserMail } from '../infrastructure/providers/tenant-mail.adapter.js';
import { createSession, getSession, destroySession, destroyUserSessions } from '../infrastructure/providers/session.adapter.js';
import { env } from '../config/env.js';
import { registerDynamicRouter } from './plugins/dynamic-router.js';
import { registerActiveSocket, unregisterActiveSocket } from './plugins/websocket.js';
import { subscribeLocal, unsubscribeLocal, publishMessage } from '../infrastructure/providers/chat-pubsub.adapter.js';
import { uuidv7 } from '../common/id.js';
import { createUserRepository } from '../feature/auth-user/infrastructure/user.repository.js';
import { makeRegisterUser } from '../feature/auth-user/application/register.usecase.js';
import { makeLoginUser } from '../feature/auth-user/application/login.usecase.js';
import { makeOAuthLogin } from '../feature/auth-user/application/oauth-login.usecase.js';
import { makeForgotPass } from '../feature/auth-user/application/forgot-pass.usecase.js';
import { makeResetPass } from '../feature/auth-user/application/reset-pass.usecase.js';
import { registerAuthUserRoutes } from '../feature/auth-user/presentation/routes/api.handler.js';
import { makeGoogleInitiate, makeGoogleExchange } from '../feature/auth-user/presentation/routes/oauth.handler.js';
import { createGoogleOAuthAdapter } from '../infrastructure/providers/google-oauth.adapter.js';
import { hashSecret, verifySecret } from '../common/password.js';
import { verifyAccessToken } from '../common/jwt.js';
import { googleAuthConfigFrom, resolveAssetStore } from './bootstrap/tenant-providers.js';
import { createContractRepository } from '../infrastructure/no-code/contract.repository.js';
import { makeListResources } from '../feature/tenant-data/application/list-resources.usecase.js';
import { makeGetResourceDetail } from '../feature/tenant-data/application/get-resource-detail.usecase.js';
import { makeFindDynamicRecords } from '../feature/tenant-data/application/find-dynamic-records.usecase.js';
import { makeInsertDynamicRecord } from '../feature/tenant-data/application/insert-dynamic-record.usecase.js';
import { makeBulkInsertRecords } from '../feature/tenant-data/application/bulk-insert-records.usecase.js';
import { makeGetRecord } from '../feature/tenant-data/application/get-record.usecase.js';
import { makeUpdateDynamicRecord } from '../feature/tenant-data/application/update-dynamic-record.usecase.js';
import { makeDeleteDynamicRecord } from '../feature/tenant-data/application/delete-dynamic-record.usecase.js';
import { makeUploadDynamicAsset } from '../feature/tenant-data/application/upload-dynamic-asset.usecase.js';
import { resolveStore } from '../infrastructure/no-code/store-resolver.js';
// P8.2: Biblioteca de medios del Master.
import { createAssetRepository } from '../feature/manage-tenant-gallery/infrastructure/asset.repository.js';
import { makeListAssets } from '../feature/manage-tenant-gallery/application/list-assets.usecase.js';
import { makeRecordAsset } from '../feature/manage-tenant-gallery/application/record-asset.usecase.js';
import { makeDeleteAsset } from '../feature/manage-tenant-gallery/application/delete-asset.usecase.js';
import { makeFindAssetReferences } from '../feature/manage-tenant-gallery/application/find-asset-references.usecase.js';
import { registerManageTenantGalleryRoutes } from '../feature/manage-tenant-gallery/presentation/routes/api.handler.js';
import { registerTenantGalleryViews } from '../feature/manage-tenant-gallery/presentation/routes/view.handler.js';
// createProviderRepository importado directamente por el hook `tenant-capabilities`; no lo usamos acá.
import { compileResourceSchema } from '../infrastructure/no-code/dynamic-validator.builder.js';
import { registerTenantDataViews } from '../feature/tenant-data/presentation/routes/view.handler.js';
import { registerTenantDataRoutes } from '../feature/tenant-data/presentation/routes/api.handler.js';
import { createMessageRepository } from '../feature/tenant-chat/infrastructure/message.repository.js';
import { makeGetMessages } from '../feature/tenant-chat/application/get-messages.usecase.js';
import { makeSendMessage } from '../feature/tenant-chat/application/send-message.usecase.js';
import { registerChatViews } from '../feature/tenant-chat/presentation/routes/view.handler.js';
import { registerChatApiRoutes } from '../feature/tenant-chat/presentation/routes/api.handler.js';
import { createNotificationRepository } from '../feature/tenant-notifications/infrastructure/notification.repository.js';
import { makePublishNotification } from '../feature/tenant-notifications/application/publish-notification.usecase.js';
import { makeScheduleNotification } from '../feature/tenant-notifications/application/schedule-notification.usecase.js';
import { makeGetLatestPublishedNotifications } from '../feature/tenant-notifications/application/get-latest-published-notifications.usecase.js';
import { makeGetScheduledNotifications } from '../feature/tenant-notifications/application/get-scheduled-notifications.usecase.js';
import { makeUpdateScheduleNotification } from '../feature/tenant-notifications/application/update-schedule-notification.usecase.js';
import { makeDeleteScheduleNotification } from '../feature/tenant-notifications/application/delete-schedule-notification.usecase.js';
import { registerTenantNotificationsRoutes } from '../feature/tenant-notifications/presentation/routes/api.handler.js';
import { registerTenantNotificationsViews } from '../feature/tenant-notifications/presentation/routes/view.handler.js';
import { enqueue as enqueueJob, cancelPending as cancelPendingJob, updateAvailableAt as updateJobAvailableAt } from '../infrastructure/providers/cache-queue.adapter.js';

/**
 * Inicializador y orquestador de subdominios específicos de inquilinos (tenant spaces, *.juliopariona.com).
 * Actúa como Composition Root para las funcionalidades dinámicas y aisladas por tenant, componiendo
 * repositorios y servicios específicos sobre la base de datos de cada cliente. Carga hooks y registra
 * las rutas del panel de control de Master/Staff (`/dashboard`), gestión interna (`/api-system`) y la API headless pública (`/api`).
 * 
 * @param {import('fastify').FastifyInstance} app - Instancia del servidor Fastify.
 * @returns {Promise<void>}
 */
export async function bootstrapTenant(app) {
  // tenant-loader: registrado GLOBAL en app.js (ver nota arriba).
  // auth-admin Master/Staff: las rutas /api-system/v1/* (login, /me, ...) se registran una vez en
  // bootstrap-platform y sirven ambos contextos vía resolveContext (apex vs subdominio).

  // P8.2: capabilities del tenant (¿tiene storage/auth/database linkeado?) pre-computadas por
  // request para que `dashboard-chrome` lo lea sin queries duplicadas por view.
  registerTenantCapabilities(app);

  // manage-master-staff (Fase 3): gestión de colaboradores (solo categoría master, vía rbac).
  const staffRepoFor = (request) => createStaffRepository({ db: request.db });
  registerStaffRoutes(app, {
    requireMaster: requireCategory('master'),
    makeInviteStaffFor: (request) =>
      makeInviteStaff({
        staffRepository: staffRepoFor(request),
        mailer: { sendMail },
        appBaseUrl: env.APP_URL,
        subdomain: request.tenant.subdomain,
      }),
    makeGetStaffFor: (request) => makeGetStaffMembers({ staffRepository: staffRepoFor(request) }),
    makeUpdateRoleFor: (request) => makeUpdateStaffRole({ staffRepository: staffRepoFor(request) }),
    makeDeleteStaffFor: (request) =>
      makeDeleteStaff({ staffRepository: staffRepoFor(request), revokeSessions: destroyUserSessions, tenantId: request.tenant.id }),
  });
  // SSR de gestión de Staff: GET /dashboard/staff (solo Master).
  registerStaffViews(app, {
    getStaffFor: (request) => makeGetStaffMembers({ staffRepository: staffRepoFor(request) }),
    getStaffRolesFor: (request) => makeGetStaffRoles({ staffRepository: staffRepoFor(request) }),
    resolveUserRoleCategories: (request) => resolveUserRoleCategories({ db: request.db }, request.user.id),
  });

  // auth-user (Fase 5): rutas headless bajo `/api/:version/auth/*` — SE REGISTRAN ANTES del
  // dispatcher para que las rutas específicas (`/auth/register`, `/auth/login`) ganen sobre el
  // catch-all `/api/:version/*`. El `contract.schema` ya reserva el segmento `auth`, así que
  // ningún contrato del asistente colisiona (constants.js RESERVED_ENDPOINT_SEGMENTS).
  const syncUserToDynamicStore = async (request, { userId, email, passwordHash }) => {
    try {
      const contractRepo = createContractRepository({ db: request.db });
      const activeContract = await contractRepo.getActiveContract();
      if (!activeContract) return;

      const userResource = activeContract.schema.resources.find((r) => r.name === 'users');
      if (!userResource) return;

      const store = await resolveStore({
        tenantId: request.tenant.id,
        tenantDb: request.db,
        storeType: userResource.store,
      });

      const emailField = userResource.fields.find((f) => f.name === 'email');
      const nameField = userResource.fields.find((f) => f.name === 'name');
      const passField = userResource.fields.find((f) => f.name === 'password_hash');

      const payload = {};
      if (emailField) payload.email = email;
      if (nameField) payload.name = email.split('@')[0];
      if (passField && passwordHash) payload.password_hash = passwordHash;

      // Iter 2026-07: replicar el shape del dispatcher (dynamic-router.js) — inserta
      // `created_at`/`updated_at` (BIGINT NOT NULL en el schema). Sin esto, el insert tiraba
      // NOT NULL constraint, el try/catch lo tragaba, y `users_db` quedaba vacío — el checkout
      // fallaba después con `orders.user_id → users.id` FOREIGN KEY constraint failed.
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
      // Log alto en severidad: si esto falla en producción, TODO el flujo de compra del tenant
      // se rompe con FK constraint failed en `orders.user_id`. El operador tiene que verlo.
      request.log.error({ err }, 'Error syncing user to dynamic store — checkout will fail with FK constraint');
    }
  };

  const userRepoFor = (request) => createUserRepository({ db: request.db });
  registerAuthUserRoutes(app, {
    session: { create: createSession, get: getSession, destroy: destroySession },
    makeRegisterFor: (request) =>
      makeRegisterUser({
        userRepository: userRepoFor(request),
        hasher: { hash: hashSecret },
        onRegisterSuccess: async ({ userId, email, passwordHash }) => {
          await syncUserToDynamicStore(request, { userId, email, passwordHash });
        },
      }),
    // Wrap del login para self-heal: si el user existe en `tenant_users` pero no en `users_db`
    // (registrado antes del contrato, o antes de que el sync fuera correcto), lo insertamos en
    // el store dinámico al login. Idempotente por `findById` en la sync — si ya existe hace
    // update de timestamp, si no lo crea. Sin passwordHash → el field password_hash queda como
    // estaba (no se pisa; en insert queda null — el auth vive en tenant_users).
    makeLoginFor: (request) => {
      const login = makeLoginUser({ userRepository: userRepoFor(request), verifier: { verify: verifySecret } });
      return async (params) => {
        const result = await login(params);
        await syncUserToDynamicStore(request, { userId: result.userId, email: result.email, passwordHash: null });
        return result;
      };
    },
    makeForgotPassFor: (request) =>
      makeForgotPass({
        userRepository: userRepoFor(request),
        // P8.4: los end users reciben correos del PROPIO tenant, no de la plataforma. Sin mail
        // provider linkeado, `sendUserMail` retorna `{ sent: false }` silencioso (matches el
        // patrón anti-enumeración: el caller ve la misma respuesta que "user no existe").
        sendUserMail: (args) => sendUserMail({ tenantDb: request.db, ...args }),
        appBaseUrl: env.APP_URL,
        subdomain: request.tenant.subdomain,
      }),
    makeResetPassFor: (request) =>
      makeResetPass({ userRepository: userRepoFor(request), hasher: { hash: hashSecret } }),
    // Self-heal en cada refresh: cubre el caso "sesión persistente" — usuario que se registró
    // antes de que el contrato tuviera `users_db`, o antes de que el sync se arreglara. Sin este
    // hook, tendrían que hacer logout+login manual para que el checkout no falle con FK.
    onRefreshSuccess: async (request, { userId, email }) => {
      await syncUserToDynamicStore(request, { userId, email, passwordHash: null });
    },
  });

  // auth-user OAuth (Iteration 26): initiate + exchange en subdominio. El callback vive en apex
  // (bootstrap-platform) porque Google Cloud solo acepta un único `redirect_uri` público por app.
  const googleAdapter = createGoogleOAuthAdapter();
  const contractLookupFor = (request) =>
    createContractRepository({ db: request.db }).getActiveContract();

  const initiate = makeGoogleInitiate({
    googleAdapter,
    providerLookup: (request) => googleAuthConfigFrom(request.db),
    contractLookup: contractLookupFor,
    appUrl: env.APP_URL,
  });
  const exchange = makeGoogleExchange({ appUrl: env.APP_URL, createSession });
  app.get('/auth/google', initiate);
  app.get('/auth/exchange', exchange);

  // WebSocket Chat (Fase 5): endpoint de chat en tiempo real con salas (canales)
  // sincronizado de forma distribuida vía Valkey Pub/Sub y con soporte de cierre forzado.
  //
  // Auth: validamos el Bearer directamente o las cookies de sesión (igual que en preValidation).
  app.get('/ws/chat', { websocket: true }, async (socket, request) => {
    let user = request.user;
    if (!user) {
      const header = request.headers.authorization || '';
      const raw = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (raw) {
        try {
          const claims = verifyAccessToken(raw);
          if (request.tenant
            && (claims.scope === 'tenant' || claims.scope === 'user')
            && claims.tenantId === request.tenant.id) {
            user = { id: claims.sub, email: claims.email, scope: claims.scope, tenantId: claims.tenantId };
          }
        } catch { /* firma inválida → user sigue null */ }
      }
    }
    if (!user || !request.tenant) {
      socket.close(4401, 'UNAUTHENTICATED');
      return;
    }

    const channel = request.query.channel;
    if (!channel || typeof channel !== 'string') {
      socket.close(4400, 'INVALID_CHANNEL');
      return;
    }

    const tenantId = request.tenant.id;

    // Registrar socket para suspensiones/eliminaciones
    registerActiveSocket(tenantId, socket);

    // Suscribir socket local al canal en el Pub/Sub
    try {
      await subscribeLocal(tenantId, channel, socket);
    } catch (err) {
      request.log.error({ err }, '[chat] error al suscribir localmente al Pub/Sub');
      socket.close(4500, 'INTERNAL_SERVER_ERROR');
      return;
    }

    // Saludo inicial informando la conexión exitosa al canal
    socket.send(JSON.stringify({ type: 'hello', scope: user.scope, tenantId, channel }));

    socket.on('message', async (rawData) => {
      try {
        let parsed = {};
        try {
          parsed = JSON.parse(rawData.toString());
        } catch {
          parsed = { text: rawData.toString() };
        }

        const messageData = {
          id: uuidv7(),
          sender: {
            id: user.id,
            email: user.email,
            scope: user.scope,
          },
          text: parsed.text || '',
          channel,
          createdAt: new Date().toISOString(),
        };

        // Persistir el mensaje antes de retransmitirlo
        const save = makeSendMessage({ messageRepository: createMessageRepository({ db: request.db, tenantId, logger: request.log }) });
        await save(messageData);

        const messagePayload = {
          event: 'message',
          data: messageData
        };

        await publishMessage(tenantId, channel, messagePayload);
      } catch (err) {
        request.log.error({ err }, '[chat] error al publicar mensaje en Pub/Sub');
      }
    });

    socket.on('close', async () => {
      unregisterActiveSocket(tenantId, socket);
      await unsubscribeLocal(tenantId, channel, socket);
    });

    socket.on('error', async () => {
      unregisterActiveSocket(tenantId, socket);
      await unsubscribeLocal(tenantId, channel, socket);
    });
  });

  // No-Code dispatcher (Fase 4): sirve `/api/:version/*` generado por el contrato del tenant.
  registerDynamicRouter(app);

  // tenant-data (Fase 5): SSR de gestión de la data de negocio (Master/Staff).
  const detailForRequest = (request) =>
    makeGetResourceDetail({ contractRepository: createContractRepository({ db: request.db }) });
  const storeDepsFor = (request) => ({ resolveStore, tenantId: request.tenant.id, tenantDb: request.db, compileResourceSchema });
  registerTenantDataViews(app, {
    listResourcesFor: (request) =>
      makeListResources({ contractRepository: createContractRepository({ db: request.db }) }),
    getResourceDetailFor: detailForRequest,
    findRecordsFor: (request) => makeFindDynamicRecords(storeDepsFor(request)),
    getRecordFor: (request) => makeGetRecord(storeDepsFor(request)),
    resolveUserRoleCategories: (request) => resolveUserRoleCategories({ db: request.db }, request.user.id),
  });
  // El resolver del store de assets (provider storage/cloudinary descifrado → adapter) vive en
  // `bootstrap/tenant-providers.js` — compartido con cualquier orquestador que suba assets.
  registerTenantDataRoutes(app, {
    getResourceDetailFor: detailForRequest,
    insertRecordFor: (request) => makeInsertDynamicRecord(storeDepsFor(request)),
    updateRecordFor: (request) => makeUpdateDynamicRecord(storeDepsFor(request)),
    deleteRecordFor: (request) => makeDeleteDynamicRecord(storeDepsFor(request)),
    uploadAssetFor: (request) => makeUploadDynamicAsset({
      resolveAssetStore,
      tenantId: request.tenant.id,
      tenantDb: request.db,
      // P8.2: registra el metadato en el catálogo local para la Biblioteca de medios del Master.
      recordAsset: makeRecordAsset({
        assetRepository: createAssetRepository({ db: request.db }),
        logger: request.log,
      }),
    }),
    bulkInsertRecords: (request) => {
      const deps = storeDepsFor(request);
      const insertRecord = makeInsertDynamicRecord(deps);
      const uc = makeBulkInsertRecords({
        insertRecord,
        resolveStore: deps.resolveStore,
        tenantId: deps.tenantId,
        tenantDb: deps.tenantDb,
      });
      return (params) => uc(params);
    },
  });

  // manage-tenant-gallery (P8.2): Biblioteca de medios del Master. Vista SSR + DELETE con
  // hard-block. El sidebar del Master decide si mostrar el link vía `hasStorageProviderFor`.
  const assetRepoFor = (request) => createAssetRepository({ db: request.db });
  registerTenantGalleryViews(app, {
    makeListAssetsFor: (request) => makeListAssets({ assetRepository: assetRepoFor(request) }),
    resolveUserRoleCategories: (request) => resolveUserRoleCategories({ db: request.db }, request.user.id),
  });
  registerManageTenantGalleryRoutes(app, {
    deleteAssetFor: (request) => makeDeleteAsset({
      assetRepository: assetRepoFor(request),
      findAssetReferences: makeFindAssetReferences({
        contractRepository: createContractRepository({ db: request.db }),
        resolveStore,
        tenantId: request.tenant.id,
        tenantDb: request.db,
        logger: request.log,
      }),
      resolveAssetStore: ({ provider }) => resolveAssetStore({
        tenantId: request.tenant.id, tenantDb: request.db, provider,
      }),
      logger: request.log,
    }),
  });
  const chatRepoFor = (request) => createMessageRepository({ db: request.db, tenantId: request.tenant.id, logger: request.log });
  registerChatViews(app, {
    resolveUserRoleCategories: (request) => resolveUserRoleCategories({ db: request.db }, request.user.id),
  });
  registerChatApiRoutes(app, {
    getMessagesFor: (request) => makeGetMessages({ messageRepository: chatRepoFor(request) }),
  });

  // tenant-notifications (Fase 5): publish inmediato + scheduling + feed público. La difusión
  // reusa el canal Valkey del pub-sub (`ws:tenant:<id>:channel:notifications_global`) para que un
  // cliente suscrito al WS reciba el evento en tiempo real. Programadas: encolan un job en
  // `platform.db.jobs` con `job.id === notification.id`; el worker las publica a su hora.
  const notificationRepoFor = (request) => createNotificationRepository({ db: request.db });
  const jobQueue = {
    enqueue: (type, opts) => enqueueJob(type, opts),
    cancelPending: cancelPendingJob,
    updateAvailableAt: updateJobAvailableAt,
  };
  registerTenantNotificationsRoutes(app, {
    publishFor: (request) => makePublishNotification({
      notificationRepository: notificationRepoFor(request),
      broadcast: (channelName, payload) => publishMessage(request.tenant.id, channelName, payload),
      tenantId: request.tenant.id,
      logger: request.log,
    }),
    scheduleFor: (request) => makeScheduleNotification({
      notificationRepository: notificationRepoFor(request),
      jobQueue,
      tenantId: request.tenant.id,
    }),
    getLatestFor: (request) => makeGetLatestPublishedNotifications({
      notificationRepository: notificationRepoFor(request),
    }),
    getScheduledFor: (request) => makeGetScheduledNotifications({
      notificationRepository: notificationRepoFor(request),
    }),
    updateScheduleFor: (request) => makeUpdateScheduleNotification({
      notificationRepository: notificationRepoFor(request),
      jobQueue,
    }),
    deleteScheduleFor: (request) => makeDeleteScheduleNotification({
      notificationRepository: notificationRepoFor(request),
      jobQueue,
    }),
  });
  registerTenantNotificationsViews(app, {
    getScheduledFor: (request) => makeGetScheduledNotifications({
      notificationRepository: notificationRepoFor(request),
    }),
    resolveUserRoleCategories: (request) => resolveUserRoleCategories({ db: request.db }, request.user.id),
  });
}
