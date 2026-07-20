/**
 * Pruebas unitarias del módulo de cifrado AES-256-GCM.
 * Verifica roundtrip, unicidad de IV por operación y detección
 * de alteraciones (tag inválido).
 *
 * @module CommonCryptoUnitTest
 */
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../crypto.js';

describe('crypto (AES-256-GCM)', () => {
  it('descifra lo que cifra (roundtrip)', () => {
    const secret = 'postgresql://user:pass@host.neon.tech/db?sslmode=require';
    const box = encrypt(secret);
    expect(box).toEqual({ ciphertext: expect.any(String), iv: expect.any(String), tag: expect.any(String) });
    expect(box.ciphertext).not.toContain('pass'); // no hay texto plano
    expect(decrypt(box)).toBe(secret);
  });

  it('usa un iv distinto por operación', () => {
    expect(encrypt('x').iv).not.toBe(encrypt('x').iv);
  });

  it('falla si los datos fueron alterados (tag inválido)', () => {
    const box = encrypt('dato');
    expect(() => decrypt({ ...box, tag: '00'.repeat(16) })).toThrow();
  });
});
