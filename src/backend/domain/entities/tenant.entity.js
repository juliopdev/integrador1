import { z } from 'zod';

const tenantValidationSchema = z.object({
  id: z.string().min(1, 'Tenant ID is required'),
  name: z.string().min(1, 'Name is required'),
  subdomain: z.string()
    .min(1, 'Subdomain is required')
    .regex(/^[a-z0-9-]+$/, 'Subdomain must be lowercase alphanumeric with hyphens only'),
  status: z.enum(['active', 'suspended']).default('active'),
  plan: z.enum(['free', 'basic', 'premium']).default('free'),
  apiAuthEnabled: z.boolean().default(true),
  backendBlueprintId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export class TenantEntity {
  constructor(data) {
    Object.assign(this, TenantEntity.validate(data));
  }

  static validate(data) {
    const result = tenantValidationSchema.safeParse(data);
    if (!result.success) {
      throw new Error(`Validation Error: ${JSON.stringify(result.error.format())}`);
    }
    return result.data;
  }
}