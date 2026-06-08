import fp from 'fastify-plugin';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';

/**
 * ES: Plugin de Fastify para configurar el servido de recursos estáticos desde la carpeta 'public'.
 * Asegura la existencia física del directorio para evitar errores de carga inicial en Fastify.
 * Servirá los estilos y scripts compilados directamente en la raíz '/' del servidor.
 * 
 * EN: Fastify plugin to configure static resource serving from the 'public' folder.
 * Ensures the physical existence of the directory to prevent Fastify boot errors.
 * Serves compiled styles and scripts directly at the root '/' path.
 */
export default fp(async (fastify, opts) => {
  const publicPath = path.resolve(process.cwd(), 'public');
  if (!fs.existsSync(publicPath)) {
    fs.mkdirSync(publicPath, { recursive: true });
  }

  // ES: Crear subcarpetas requeridas para estilos y scripts compilados.
  // EN: Create required subfolders for compiled styles and scripts.
  const stylesPath = path.join(publicPath, 'styles');
  if (!fs.existsSync(stylesPath)) {
    fs.mkdirSync(stylesPath, { recursive: true });
  }

  const scriptsPath = path.join(publicPath, 'scripts');
  if (!fs.existsSync(scriptsPath)) {
    fs.mkdirSync(scriptsPath, { recursive: true });
  }

  fastify.register(fastifyStatic, {
    root: publicPath,
    prefix: '/',
  });
}, { name: 'static-assets' });
