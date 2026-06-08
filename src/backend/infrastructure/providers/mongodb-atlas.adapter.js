import { MongoClient } from 'mongodb';

/**
 * ES: Adaptador de base de datos para MongoDB Atlas.
 * Conecta y registra un historial de auditoría inmutable de cambios de planos técnicos (No-code blueprints).
 * Diseñado de forma tolerante a fallos: si la conexión falla o las credenciales no son válidas,
 * funciona en modo de simulación (Mock) reportando en consola sin interrumpir la ejecución del servidor Fastify.
 * 
 * EN: MongoDB Atlas Database Adapter.
 * Connects and stores an immutable audit history of changes made to technical layouts (No-code blueprints).
 * Fault-tolerant design: if connection fails or credentials are invalid,
 * it runs in simulation (Mock) mode, logging to the console without interrupting the Fastify server loop.
 */
export class MongoAtlasAdapter {
  /**
   * @param {Object} cradle 
   * @param {Object} cradle.env
   */
  constructor({ env }) {
    this.mongoUrl = env.MONGO_ATLAS_URL;
    this.client = null;
    this.db = null;
    this.connected = false;
  }

  /**
   * ES: Intenta conectar al clúster de MongoDB Atlas.
   * EN: Attempts to connect to the MongoDB Atlas cluster.
   */
  async connect() {
    if (this.connected) return;
    try {
      this.client = new MongoClient(this.mongoUrl, {
        serverSelectionTimeoutMS: 2000, // ES: Timeout corto para evitar congelamiento de arranque. EN: Short timeout to avoid boot freezes.
      });
      await this.client.connect();
      this.db = this.client.db();
      this.connected = true;
      console.log('✅ Connected successfully to MongoDB Atlas / Conectado con éxito a MongoDB Atlas');
    } catch (err) {
      console.warn('⚠️ MongoDB Atlas connection failed (Running in Mock mode) / Conexión a MongoDB Atlas falló (Modo Mock activo):', err.message);
      this.connected = false;
    }
  }

  /**
   * ES: Guarda un evento de auditoría de cambio estructural.
   * EN: Saves a structural change audit log event.
   * 
   * @param {Object} change - ES: Evento de cambio (action, blueprintId, details). EN: Change event details.
   */
  async logChange(change) {
    if (!this.connected) {
      await this.connect();
    }

    const logEntry = {
      ...change,
      timestamp: new Date().toISOString(),
    };

    if (this.connected && this.db) {
      try {
        await this.db.collection('blueprint_audit_logs').insertOne(logEntry);
        console.log('📝 Audit log saved to MongoDB Atlas / Registro de auditoría guardado en MongoDB Atlas');
      } catch (err) {
        console.error('❌ Failed to write audit log to MongoDB Atlas / Error al escribir auditoría en MongoDB Atlas:', err.message);
      }
    } else {
      console.log('📝 [Mock Mongo] Audit log logged to console / Registro de auditoría simulado:', JSON.stringify(logEntry, null, 2));
    }
  }

  /**
   * ES: Cierra limpiamente la conexión física.
   * EN: Cleanly closes the physical connection.
   */
  async close() {
    if (this.client && this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
