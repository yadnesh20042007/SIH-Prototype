/**
 * Validation for Manufacturer API payloads.
 *
 * Database-managed fields (`id`, `createdAt`, and `updatedAt`) and relations are
 * intentionally not part of these payloads.
 */

import {
  assertObject,
  type FieldError,
  ValidationResult,
} from './common';

export interface ManufacturerCreatePayload {
  name: string;
  country?: string | null;
  registrationCode?: string | null;
}

export type ManufacturerUpdatePayload = Partial<ManufacturerCreatePayload>;

export interface ManufacturerValidation<T> {
  success: boolean;
  data?: T;
  errors: FieldError[];
}

function requiredString(
  body: Record<string, unknown>,
  field: string,
  result: ValidationResult
): string | undefined {
  const value = body[field];

  if (typeof value !== 'string') {
    result.add(field, value === undefined || value === null ? 'is required' : 'must be a string');
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    result.add(field, 'is required');
    return undefined;
  }

  return trimmed;
}

function optionalString(
  body: Record<string, unknown>,
  field: string,
  result: ValidationResult
): string | null | undefined {
  const value = body[field];

  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') {
    result.add(field, 'must be a string or null');
    return undefined;
  }

  return value.trim();
}

function outcome<T>(result: ValidationResult, data: T): ManufacturerValidation<T> {
  if (!result.isValid) return { success: false, errors: result.errors };
  return { success: true, data, errors: [] };
}

/** Validates and normalizes a payload used to create a Manufacturer. */
export function validateManufacturerCreate(
  value: unknown
): ManufacturerValidation<ManufacturerCreatePayload> {
  const result = new ValidationResult();
  const body = assertObject(value, result);
  if (!body) return { success: false, errors: result.errors };

  const data: ManufacturerCreatePayload = {
    name: requiredString(body, 'name', result) ?? '',
  };

  for (const field of ['country', 'registrationCode'] as const) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const normalized = optionalString(body, field, result);
    if (normalized !== undefined) data[field] = normalized;
  }

  return outcome(result, data);
}

/** Validates and normalizes a partial payload used to update a Manufacturer. */
export function validateManufacturerUpdate(
  value: unknown
): ManufacturerValidation<ManufacturerUpdatePayload> {
  const result = new ValidationResult();
  const body = assertObject(value, result);
  if (!body) return { success: false, errors: result.errors };

  const data: ManufacturerUpdatePayload = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = requiredString(body, 'name', result);
    if (name !== undefined) data.name = name;
  }

  for (const field of ['country', 'registrationCode'] as const) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const normalized = optionalString(body, field, result);
    if (normalized !== undefined) data[field] = normalized;
  }

  return outcome(result, data);
}
