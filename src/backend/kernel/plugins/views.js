import fp from 'fastify-plugin';
import fastifyView from '@fastify/view';
import ejs from 'ejs';
import path from 'path';

/**
 * ES: Plugin de Fastify para configurar el motor de plantillas EJS.
 * Se define la raíz de búsqueda en 'src/backend' para posibilitar la renderización
 * de plantillas en carpetas comunes o dentro de cualquier característica usando rutas relativas.
 * 
 * EN: Fastify plugin to configure the EJS template engine.
 * Sets the search root at 'src/backend' to enable template rendering
 * from common templates or inside any feature using relative paths.
 */
export default fp(async (fastify, opts) => {
  fastify.register(fastifyView, {
    engine: {
      ejs: ejs,
    },
    // ES: Definimos la raíz común del proyecto (backend + frontend). EN: Define the common project root.
    root: path.resolve(process.cwd(), 'src'),
    propertyName: 'view',
  });
}, { name: 'views' });
