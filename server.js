const http = require("http");
const app = require("./src/app");
const config = require("./src/config");

const Container = require("./src/core/container/Container");
const DatabaseFactory = require("./src/infrastructure/database/DatabaseFactory");
const BackendRegistry = require("./src/application/backend-management/BackendRegistry");
const WebSocketManager = require("./src/infrastructure/websocket/WebSocketManager");
const WebsocketDynamicController = require("./src/infrastructure/http/response/backend-builded/websocket-dynamic.controller");
const BackendModule = require("./src/core/entities/BackendModule");
const BackendRepository = require("./src/core/repositories/BackendRepository");
const SystemDatabase = require("./src/infrastructure/database/sqlite/SystemDatabase");
const BuildedDatabase = require("./src/infrastructure/database/sqlite/BuildedDatabase");
const MeDatabase = require("./src/infrastructure/database/sqlite/MeDatabase");
const ExpirationWorker = require("./src/application/workers/ExpirationWorker");

const PORT = config.port;

// 1. Crear el Motor Server HTTP
const server = http.createServer(app);

// 2. Variable global para el estado de apagado (Graceful Shutdown)
let isShuttingDown = false;

async function bootstrap() {
  console.log("🔄 Iniciando secuencia de arranque (Bootstrap)...");

  try {
    // 3. Inicializar el motor de Tiempo Real en el Servidor HTTP
    WebSocketManager.init(server);

    // 4. Inyectar dependencias globales en el Container Singleton
    Container.register("DatabaseFactory", DatabaseFactory);
    Container.register("BackendRegistry", BackendRegistry);
    Container.register("WebSocketManager", WebSocketManager);

    // 5. Inicializar Bases de Datos Principales (Conexión)
    await SystemDatabase.init();
    await BuildedDatabase.init();
    await MeDatabase.init();

    // Iniciar tareas de mantenimiento en segundo plano (limpieza de expirados)
    await BuildedDatabase.startMaintenance();

    const backendRepo = new BackendRepository(BuildedDatabase);

    // Obtenemos todos los blueprints del SQLite original
    const persistedEndpoints = await backendRepo.getEndpoints();
    console.log(
      `[Bootstrap] Cargando ${persistedEndpoints ? persistedEndpoints.length : 0} Backends activos en memoria...`,
    );

    if (persistedEndpoints) {
      for (const endpointData of persistedEndpoints) {
        const configs =
          endpointData.databaseConfigs ||
          (endpointData.databaseConfig ? [endpointData.databaseConfig] : []);

        if (configs.length === 0) {
          console.warn(
            `[Bootstrap] ⚠️ Saltando backend '${endpointData.slug}' porque no tiene una configuración de base de datos válida.`,
          );
          continue;
        }

        const providers = configs.map((cfg) => {
          const provider = DatabaseFactory.createProvider(cfg);
          provider.connectionStatus = "connecting";
          provider
            .connect()
            .then((success) => {
              provider.connectionStatus = success ? "connected" : "error";
            })
            .catch((err) => {
              console.error(
                `[Bootstrap] Error connecting to DB (${cfg.type}) for ${endpointData.slug}:`,
                err.message,
              );
              provider.connectionStatus = "error";
            });
          return provider;
        });

        // Construimos la entidad con todos sus proveedores
        const moduleInstance = new BackendModule(endpointData, providers);

        // La registramos al "Proxy Observer"
        BackendRegistry.register(moduleInstance);

        // Si el admin prendió el WebSocket, suscribimos la BD al emisor de en tiempo real del socket
        if (endpointData.websocketEnabled) {
          await WebsocketDynamicController.attachToBackend(moduleInstance);
        }
      }
    }

    // 6. Arrancar definitivamente a escuchar puertos web
    server.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🔌 Esta appweb esta encendida y escuchando HTTP + WS`);
      console.log(`🌐 Dashboard:         http://localhost:${PORT}/dashboard`);
      console.log(`🧪 Health Check:      http://localhost:${PORT}/health`);
      console.log(`======================================================\n`);

      // 7. Iniciar el escáner de tiempo de vida
      ExpirationWorker.start();
    });
  } catch (error) {
    console.error("❌ Error fatal crasheando el Bootstrap Sequence:", error);
    process.exit(1);
  }
}

// -------------------------------------------------------------
// GRACEFUL SHUTDOWN (Cierre elegante seguro para VPS o Docker)
// -------------------------------------------------------------

function shutdownSequencer(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.warn(
    `\n⚠️ Se ha detectado la señal (${signal}) desde el S.O o Contenedor.`,
  );
  console.warn(
    "Iniciando cierre elegante (Graceful Shutdown) para no corromper transacciones HTTP ni Tablas DB activas...",
  );

  // 1. Dejar de recibir más peticiones HTTP nuevas
  server.close(async (err) => {
    if (err) {
      console.error("Error al cerrar el servidor HTTP:", err);
      process.exit(1);
    }

    console.log(
      "✅ Servidor HTTP cerrado (Drenado). Sin recibir más peticiones.",
    );

    try {
      // 2. Cortar el motor WS y notificar a los clientes conectados
      await WebSocketManager.shutdown();

      // 3. Destruir TODAS las conexiones de bases de datos limpiamente
      await DatabaseFactory.shutdownAll();

      // 4. Cerrar las BDs SQLite principales
      await SystemDatabase.close();
      await BuildedDatabase.close();
      await MeDatabase.close();

      console.log("✅ Base de datos y WebSockets drenados sin corrupción.");
      console.log("👋 Adios.");
      process.exit(0);
    } catch (closeError) {
      console.error("❌ Error forzando el cierre de dependencias:", closeError);
      process.exit(1);
    }
  });

  // Timeout de Fuerza (Si hay Queries travadas q no mueren despues de 10 seg => Matazo)
  setTimeout(() => {
    console.error(
      "❌ El cierre elegante excedió 10 segundos. Forzando detención total...",
    );
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdownSequencer("SIGTERM"));
process.on("SIGINT", () => shutdownSequencer("SIGINT"));

bootstrap();
