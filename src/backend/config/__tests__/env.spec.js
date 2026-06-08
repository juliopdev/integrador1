import { describe, it, expect } from 'vitest';
import { envSchema } from '../env.js';

describe('Environment Variables Schema', () => {
  it('should validate valid environment configuration and apply defaults', () => {
    const mockEnv = {
      PORT: '8080',
      NODE_ENV: 'production',
    };

    const result = envSchema.safeParse(mockEnv);
    expect(result.success).toBe(true);
    expect(result.data.PORT).toBe(8080);
    expect(result.data.NODE_ENV).toBe('production');
    expect(result.data.SYSTEM_DB_PATH).toBe('data/system.db');
  });

  it('should fail validation on invalid NODE_ENV', () => {
    const mockEnv = {
      NODE_ENV: 'invalid_environment',
    };

    const result = envSchema.safeParse(mockEnv);
    expect(result.success).toBe(false);
  });
});
