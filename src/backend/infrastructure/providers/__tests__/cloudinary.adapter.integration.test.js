import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCloudinaryStore } from '../cloudinary.adapter.js';

// Integración contra Cloudinary REAL — sube UN asset diminuto (PNG 1×1) por corrida y lo borra.
// Solo corre cuando `TEST_URI_CONECTION_CLOUDINARY` está configurada (no placeholder).
const URI = process.env.TEST_URI_CONECTION_CLOUDINARY;
const canRun = URI && !URI.includes('cloudinary://...');
const suite = canRun ? describe : describe.skip;

// PNG mínimo válido de 1x1 pixel transparente.
const TINY_PNG = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001010300000025db56ca00000003504c5445000000a77a3dda0000000174524e530040e6d8660000000a49444154081d63600000000200015b3c25990000000049454e44ae426082', 'hex');
const FOLDER = `baas-test/upload-${Date.now()}`;

let store;
let uploadedPublicId;

beforeAll(() => {
  store = canRun ? createCloudinaryStore(URI) : null;
}, 30000);

afterAll(async () => {
  if (uploadedPublicId && store) {
    // Cleanup best-effort — dejamos el folder de test limpio.
    try { await store.destroy(uploadedPublicId); } catch { /* silencioso */ }
  }
}, 30000);

suite('cloudinary store (integración · Cloudinary real)', () => {
  it('uploadBuffer → sube 1 PNG y devuelve secure_url + publicId', async () => {
    const result = await store.uploadBuffer({ buffer: TINY_PNG, folder: FOLDER });
    expect(result.url).toMatch(/^https:\/\/res\.cloudinary\.com\/.+\.(png|jpg|jpeg|webp)/);
    expect(result.publicId).toContain(FOLDER);
    expect(result.bytes).toBeGreaterThan(0);
    uploadedPublicId = result.publicId;
  }, 30000);

  it('destroy → elimina el asset previamente subido', async () => {
    if (!uploadedPublicId) return; // el upload previo falló y skipeó
    const res = await store.destroy(uploadedPublicId);
    expect(res.result).toBe('ok');
    uploadedPublicId = null; // ya no hace falta cleanup
  }, 30000);
});
