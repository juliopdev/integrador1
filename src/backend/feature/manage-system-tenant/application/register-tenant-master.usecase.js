import bcrypt from 'bcryptjs';
import { getTenantDb } from '../../../config/database.js';
import { users } from '../../../config/drizzle/schema.js';

/**
 * ES: Caso de Uso Orquestador para registrar un nuevo inquilino y configurar su cuenta maestra (Master).
 * Flujo:
 * 1. Hashea la contraseña y frase de seguridad del Master.
 * 2. Registra los metadatos del inquilino en la base de datos central (system.db).
 * 3. Crea el archivo de base de datos física del inquilino aplicando DDL.
 * 4. Inserta el usuario maestro con rol 'master' dentro de la base de datos del inquilino.
 * 
 * EN: Orchestrator Use Case to register a new tenant and configure its master account (Master).
 * Flow:
 * 1. Hashes the Master's password and passphrase.
 * 2. Registers tenant metadata in the central database (system.db).
 * 3. Creates the tenant's physical database file and applies DDL schema.
 * 4. Inserts the master user with 'master' role inside the tenant's database.
 */
export class RegisterTenantMasterUseCase {
  /**
   * @param {Object} cradle
   * @param {import('../infrastructure/tenant.repository').TenantRepository} cradle.tenantRepository
   * @param {import('./provision-tenant-db.usecase').ProvisionTenantDbUseCase} cradle.provisionTenantDbUseCase
   * @param {import('../../manage-system-backend/infrastructure/blueprint.repository').BlueprintRepository} cradle.blueprintRepository
   */
  constructor({ tenantRepository, provisionTenantDbUseCase, blueprintRepository }) {
    this.tenantRepository = tenantRepository;
    this.provisionTenantDbUseCase = provisionTenantDbUseCase;
    this.blueprintRepository = blueprintRepository;
  }

  /**
   * ES: Ejecuta el registro completo del inquilino y su cuenta Master.
   * EN: Executes the complete registration of the tenant and its Master account.
   * 
   * @param {Object} input
   * @param {string} input.id
   * @param {string} input.name
   * @param {string} input.subdomain
   * @param {string} [input.plan]
   * @param {string} [input.backendBlueprintId]
   * @param {string} input.masterEmail
   * @param {string} input.masterPassword
   * @param {string} input.masterPassphrase
   * @returns {Promise<Object>} ES: Datos del inquilino creado. EN: Created tenant data.
   */
  async execute({ id, name, subdomain, plan, backendBlueprintId, masterEmail, masterPassword, masterPassphrase }) {
    if (!id || !name || !subdomain || !masterEmail || !masterPassword || !masterPassphrase) {
      throw new Error('Missing required fields for tenant registration / Faltan campos obligatorios para el registro de inquilinos');
    }

    // ES: Validar unicidad del ID y del subdominio.
    // EN: Validate unique ID and subdomain.
    const existingById = await this.tenantRepository.findById(id);
    if (existingById) {
      throw new Error(`Tenant ID "${id}" is already registered / El ID de inquilino ya está registrado`);
    }

    const existingBySubdomain = await this.tenantRepository.findBySubdomain(subdomain);
    if (existingBySubdomain) {
      throw new Error(`Subdomain "${subdomain}" is already registered / El subdominio ya está registrado`);
    }

    // ES: Validar el plano de backend si se provee.
    // EN: Validate the backend blueprint if provided.
    let blueprint = null;
    if (backendBlueprintId) {
      blueprint = await this.blueprintRepository.findById(backendBlueprintId);
      if (!blueprint) {
        throw new Error(`Backend Blueprint "${backendBlueprintId}" not found / Plano técnico de backend no encontrado`);
      }
    }

    // ES: Cifrar credenciales del Master de forma asíncrona.
    // EN: Hash Master credentials asynchronously.
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(masterPassword, salt);
    const hashedPassphrase = await bcrypt.hash(masterPassphrase, salt);

    // ES: 1. Crear registro en system.db.
    // EN: 1. Create record in system.db.
    const tenant = await this.tenantRepository.create({
      id,
      name,
      subdomain,
      status: 'active',
      plan: plan || 'free',
      apiAuthEnabled: 1,
      backendBlueprintId: backendBlueprintId || null,
    });

    try {
      // ES: 2. Crear archivo físico y aplicar migraciones + esquema dinámico.
      // EN: 2. Create physical file and apply migrations + dynamic schema.
      await this.provisionTenantDbUseCase.execute(id, blueprint ? blueprint.schema : null);

      // ES: 3. Sembrar el usuario maestro.
      // EN: 3. Seed the master user.
      const tenantDb = getTenantDb(id);
      await tenantDb.insert(users).values({
        email: masterEmail,
        password: hashedPassword,
        passphrase: hashedPassphrase,
        role: 'master',
        status: 'active',
      });
    } catch (err) {
      console.error(`❌ Rollback or cleanup for tenant ${id} may be required / Podría requerirse limpieza para el inquilino:`, err);
      throw err;
    }

    return tenant;
  }
}
