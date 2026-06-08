import fp from 'fastify-plugin';
import container from '../container/container.js';

/**
 * ES: Plugin de Fastify para la integración del contenedor IoC Awilix en el ciclo de vida de las solicitudes.
 * Expone el contenedor global en la instancia del servidor y crea un scope temporal desechable para cada request.
 * 
 * EN: Fastify plugin for integrating the Awilix IoC container into the request lifecycle.
 * Exposes the root container in the server instance and creates a temporary, disposable scope for each request.
 */
export default fp(async (fastify, opts) => {
  // ES: Registra el contenedor raíz como un decorador de la instancia de Fastify.
  // EN: Register the root container as a decorator on the Fastify instance.
  fastify.decorate('container', container);

  // ES: Crea y asocia un contenedor de petición hijo (scoped) en el hook 'onRequest'.
  // EN: Create and attach a child request-scoped container during the 'onRequest' hook.
  fastify.addHook('onRequest', async (req, reply) => {
    req.scope = container.createScope();
  });

  // ES: Libera y limpia el contenedor de petición al concluir el envío de la respuesta en 'onResponse'.
  // EN: Dispose of and clean up the request-scoped container when the response is completed in 'onResponse'.
  fastify.addHook('onResponse', async (req, reply) => {
    if (req.scope) {
      req.scope.dispose();
    }
  });
}, { name: 'fastify-awilix' });
