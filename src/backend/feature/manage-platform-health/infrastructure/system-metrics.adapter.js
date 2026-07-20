import os from 'node:os';
import { statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Adapter de métricas del sistema para el dashboard de salud del platform.
 * Encapsula las dependencias de `node:os` y operaciones de filesystem que miden
 * tamaño de directorios para que el use case permanezca libre de I/O concreta.
 *
 * @returns {{
 *   totalMemory: () => number,
 *   freeMemory: () => number,
 *   loadAvg: () => number[],
 *   hostname: () => string,
 *   platform: () => string,
 *   arch: () => string,
 *   cpuCount: () => number,
 *   nodeVersion: string,
 *   uptimeSec: () => number,
 *   fileSize: (path: string) => number,
 *   sumDirSize: (path: string) => { path: string, bytes: number, count: number },
 *   join: (...parts: string[]) => string,
 * }}
 */
export function createSystemMetricsAdapter() {
  return {
    totalMemory: () => os.totalmem(),
    freeMemory: () => os.freemem(),
    loadAvg: () => os.loadavg(),
    hostname: () => os.hostname(),
    platform: () => os.platform(),
    arch: () => os.arch(),
    cpuCount: () => os.cpus().length,
    nodeVersion: process.version,
    uptimeSec: () => Math.round(process.uptime()),

    /**
     * Retorna el tamaño de un archivo en bytes.
     * @param {string} path - Ruta del archivo.
     * @returns {number} Tamaño en bytes (0 si no existe).
     */
    fileSize(path) {
      try { return statSync(path).size; }
      catch { return 0; }
    },

    /**
     * Calcula el tamaño total de un directorio (recursivo).
     * @param {string} path - Ruta del directorio.
     * @returns {{path: string, bytes: number, count: number}} Tamaño total y cantidad de archivos.
     */
    sumDirSize(path) {
      let total = 0;
      let count = 0;
      try {
        const entries = readdirSync(path, { withFileTypes: true });
        for (const entry of entries) {
          const full = join(path, entry.name);
          try {
            if (entry.isDirectory()) {
              const nested = this.sumDirSize(full);
              total += nested.bytes;
              count += nested.count;
            } else if (entry.isFile()) {
              total += statSync(full).size;
              count += 1;
            }
          } catch { /* archivo desaparecido, ignoramos */ }
        }
      } catch { /* dir no existe todavía */ }
      return { path, bytes: total, count };
    },

    join,
  };
}
