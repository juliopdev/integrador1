import { asClass } from 'awilix';

// Repositories
import { AdminRepository } from '../../../../feature/auth-admin/infrastructure/admin.repository.js';
import { UserRepository } from '../../../../feature/auth-user/infrastructure/user.repository.js';
import { TenantRepository } from '../../../../feature/manage-system-tenant/infrastructure/tenant.repository.js';
import { BlueprintRepository } from '../../../../feature/manage-system-backend/infrastructure/blueprint.repository.js';

// Admin Use Cases
import { LoginAdminUseCase } from '../../../../feature/auth-admin/application/login.usecase.js';
import { LogoutAdminUseCase } from '../../../../feature/auth-admin/application/logout.usecase.js';
import { RefreshTokenAdminUseCase } from '../../../../feature/auth-admin/application/refresh-token.usecase.js';

// User Use Cases
import { LoginUserUseCase } from '../../../../feature/auth-user/application/login.usecase.js';
import { RegisterUserUseCase } from '../../../../feature/auth-user/application/register.usecase.js';

// System Tenant Use Cases
import { ProvisionTenantDbUseCase } from '../../../../feature/manage-system-tenant/application/provision-tenant-db.usecase.js';
import { RegisterTenantMasterUseCase } from '../../../../feature/manage-system-tenant/application/register-tenant-master.usecase.js';
import { GetTenantsUseCase } from '../../../../feature/manage-system-tenant/application/get-tenants.usecase.js';
import { GetTenantDetailUseCase } from '../../../../feature/manage-system-tenant/application/get-tenant-detail.usecase.js';
import { ToggleTenantStatusUseCase } from '../../../../feature/manage-system-tenant/application/toggle-tenant-status.usecase.js';

// System Backend Use Cases
import { DefineDbSchemaUseCase } from '../../../../feature/manage-system-backend/application/define-db-schema.usecase.js';
import { UpdateBackendUseCase } from '../../../../feature/manage-system-backend/application/update-backend.usecase.js';
import { DeleteBackendUseCase } from '../../../../feature/manage-system-backend/application/delete-backend.usecase.js';
import { GetBackendsUseCase } from '../../../../feature/manage-system-backend/application/get-backends.usecase.js';
import { GetBackendDetailUseCase } from '../../../../feature/manage-system-backend/application/get-backend-detail.usecase.js';

/**
 * ES: Registra los repositorios y casos de uso en el contenedor IoC global.
 * EN: Registers repositories and usecases in the global IoC container.
 * 
 * @param {import('awilix').AwilixContainer} container 
 */
export function registerFeaturesModule(container) {
  container.register({
    // ES: Repositorios (userRepository es scoped porque depende de tenantDb).
    // EN: Repositories (userRepository is scoped since it depends on tenantDb).
    adminRepository: asClass(AdminRepository).singleton(),
    userRepository: asClass(UserRepository).scoped(),
    tenantRepository: asClass(TenantRepository).singleton(),
    blueprintRepository: asClass(BlueprintRepository).singleton(),

    // ES: Casos de Uso Administrativos.
    // EN: Administrative Use Cases.
    loginAdminUseCase: asClass(LoginAdminUseCase).singleton(),
    logoutAdminUseCase: asClass(LogoutAdminUseCase).singleton(),
    refreshTokenAdminUseCase: asClass(RefreshTokenAdminUseCase).singleton(),

    // ES: Casos de Uso para Usuarios Finales (scoped por depender del contexto de inquilino).
    // EN: End-User Use Cases (scoped as they depend on the tenant connection context).
    loginUserUseCase: asClass(LoginUserUseCase).scoped(),
    registerUserUseCase: asClass(RegisterUserUseCase).scoped(),

    // ES: Casos de Uso del Sistema para Inquilinos.
    // EN: System Use Cases for Tenants.
    provisionTenantDbUseCase: asClass(ProvisionTenantDbUseCase).singleton(),
    registerTenantMasterUseCase: asClass(RegisterTenantMasterUseCase).singleton(),
    getTenantsUseCase: asClass(GetTenantsUseCase).singleton(),
    getTenantDetailUseCase: asClass(GetTenantDetailUseCase).singleton(),
    toggleTenantStatusUseCase: asClass(ToggleTenantStatusUseCase).singleton(),

    // ES: Casos de Uso del Sistema para Planos Técnicos.
    // EN: System Use Cases for Technical Blueprints.
    defineDbSchemaUseCase: asClass(DefineDbSchemaUseCase).singleton(),
    updateBackendUseCase: asClass(UpdateBackendUseCase).singleton(),
    deleteBackendUseCase: asClass(DeleteBackendUseCase).singleton(),
    getBackendsUseCase: asClass(GetBackendsUseCase).singleton(),
    getBackendDetailUseCase: asClass(GetBackendDetailUseCase).singleton(),
  });
}