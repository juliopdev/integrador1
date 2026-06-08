import { asValue, asClass } from 'awilix';
import { env } from '../../../config/env.js';
import { systemDb } from '../../../config/database.js';
import { MongoAtlasAdapter } from '../../../infrastructure/providers/mongodb-atlas.adapter.js';
import { registerJwtModule } from '../di-register/auth/jwt.module.js';
import { registerCookieModule } from '../di-register/auth/cookie.module.js';
import { registerFeaturesModule } from '../di-register/features/features.module.js';

/**
 * ES: Perfil de Registro de Dependencias del Sistema Global.
 * Carga e integra los submódulos de seguridad, cookies y lógica de negocio.
 * 
 * EN: Global System Dependency Registration Profile.
 * Loads and integrates the security, cookies, and business logic submodules.
 * 
 * @param {import('awilix').AwilixContainer} container 
 */
export function registerSystemDeps(container) {
  container.register({
    env: asValue(env),
    systemDb: asValue(systemDb),
    mongoAtlasAdapter: asClass(MongoAtlasAdapter).singleton(),
  });

  // ES: Cargar módulos de autenticación, almacenamiento de sesión y lógicas.
  // EN: Load authentication, session storage, and business logic modules.
  registerJwtModule(container);
  registerCookieModule(container);
  registerFeaturesModule(container);
}
