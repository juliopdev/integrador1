import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, statSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

/**
 * Adapter de filesystem compartido. Encapsula toda la I/O de `node:fs` y `node:child_process`
 * para que application layer (use cases, jobs) permanezca libre de dependencias de infraestructura.
 *
 * @returns {{
 *   ensureDir: (path: string) => void,
 *   writeFile: (path: string, data: Buffer | string) => void,
 *   readFile: (path: string, encoding?: BufferEncoding) => string,
 *   remove: (path: string) => void,
 *   removeFile: (path: string) => void,
 *   exists: (path: string) => boolean,
 *   listDir: (path: string, options?: { withFileTypes?: boolean }) => import('node:fs').Dirent[] | string[],
 *   isDir: (path: string) => boolean,
 *   fileSize: (path: string) => number,
 *   fileMtimeMs: (path: string) => number,
 *   copyFile: (src: string, dest: string) => void,
 *   exec: (cmd: string, opts?: object) => Buffer,
 *   execFile: (file: string, args?: string[], opts?: object) => Buffer,
 *   join: (...parts: string[]) => string,
 *   relative: (from: string, to: string) => string,
 *   extname: (path: string) => string,
 * }}
 */
export function createFsAdapter() {
  return {
    ensureDir: (path) => mkdirSync(path, { recursive: true }),
    writeFile: (path, data) => writeFileSync(path, data),
    readFile: (path, encoding) => readFileSync(path, encoding),
    remove: (path) => rmSync(path, { recursive: true, force: true }),
    removeFile: (path) => unlinkSync(path),
    exists: (path) => existsSync(path),
    listDir: (path, options) => readdirSync(path, options),
    isDir: (path) => statSync(path).isDirectory(),
    fileSize: (path) => statSync(path).size,
    fileMtimeMs: (path) => statSync(path).mtimeMs,
    copyFile: (src, dest) => copyFileSync(src, dest),
    exec: (cmd, opts) => execSync(cmd, { stdio: 'pipe', ...opts }),
    execFile: (file, args = [], opts) => execFileSync(file, args, { stdio: 'pipe', ...opts }),
    join,
    relative,
    extname,
  };
}
