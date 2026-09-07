import { describe, expect, it } from 'vitest';

import {
  validateManufacturerCreate,
  validateManufacturerUpdate,
} from './manufacturer';

describe('validateManufacturerCreate', () => {
  it('accepts a valid create payload and trims its strings', () => {
    const result = validateManufacturerCreate({
      name: '  Acme Weighing  ',
      country: '  India  ',
      registrationCode: '  ACME-01  ',
    });

    expect(result).toEqual({
      success: true,
      data: {
        name: 'Acme Weighing',
        country: 'India',
        registrationCode: 'ACME-01',
      },
      errors: [],
    });
  });

  it('rejects a missing required field', () => {
    const result = validateManufacturerCreate({ country: 'India' });

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual({ field: 'name', message: 'is required' });
  });

  it('rejects an empty required string', () => {
    const result = validateManufacturerCreate({ name: '' });

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual({ field: 'name', message: 'is required' });
  });

  it('rejects a whitespace-only required string', () => {
    const result = validateManufacturerCreate({ name: '   \t ' });

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual({ field: 'name', message: 'is required' });
  });

  it('rejects an incorrect field type', () => {
    const result = validateManufacturerCreate({ name: 42 });

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual({ field: 'name', message: 'must be a string' });
  });
});

describe('validateManufacturerUpdate', () => {
  it('accepts a valid partial update and trims its strings', () => {
    const result = validateManufacturerUpdate({ country: '  Germany  ' });

    expect(result).toEqual({
      success: true,
      data: { country: 'Germany' },
      errors: [],
    });
  });
});
