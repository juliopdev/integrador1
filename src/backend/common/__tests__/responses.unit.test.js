/**
 * Pruebas unitarias de las funciones de serialización y estructura
 * de respuestas HTTP (serialize, successBody, errorBody).
 *
 * @module CommonResponsesUnitTest
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize, successBody, errorBody } from '../responses.js';

describe('responses (common)', () => {
  const schema = z.object({
    id: z.string(),
    email: z.string().email(),
  });

  describe('serialize', () => {
    it('debe serializar datos válidos y eliminar campos adicionales (strip)', () => {
      const payload = {
        id: '123',
        email: 'user@example.com',
        secretToken: 'super-secret', // no está en el esquema
      };

      const result = serialize(schema, payload);

      expect(result).toEqual({
        id: '123',
        email: 'user@example.com',
      });
      expect(result.secretToken).toBeUndefined();
    });

    it('debe lanzar un error detallado si la validación falla', () => {
      const payload = {
        id: 123, // debería ser string
        email: 'not-an-email', // formato inválido
      };

      expect(() => serialize(schema, payload)).toThrowError(
        /Serialization validation failed/
      );
    });
  });

  describe('successBody', () => {
    it('debe estructurar cuerpo de éxito con envelope "data"', () => {
      const data = { foo: 'bar' };
      expect(successBody(data)).toEqual({ data });
    });

    it('debe incluir meta si se le proporciona', () => {
      const data = ['item'];
      const meta = { total: 1 };
      expect(successBody(data, meta)).toEqual({ data, meta });
    });
  });

  describe('errorBody', () => {
    it('debe estructurar cuerpo de error consistente', () => {
      const res = errorBody(400, 'BAD_REQUEST', 'Error message');
      expect(res).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        code: 'BAD_REQUEST',
        message: 'Error message',
      });
    });
  });
});
