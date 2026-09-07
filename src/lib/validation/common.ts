/**
 * @file common.ts
 * @description Shared validation primitives used by all API validation modules.
 *
 * This file contains only general data-integrity helpers.
 * No OIML R76 regulatory logic belongs here.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldError {
  field: string;
  message: string;
}

/** Accumulates field-level validation errors for a single request. */
export class ValidationResult {
  private readonly _errors: FieldError[] = [];

  get errors(): FieldError[] {
    return this._errors;
  }

  get isValid(): boolean {
    return this._errors.length === 0;
  }

  add(field: string, message: string): this {
    this._errors.push({ field, message });
    return this;
  }
}

// ─── Decimal helpers ──────────────────────────────────────────────────────────

/**
 * Attempts to parse a JSON number or numeric string into a canonical decimal
 * string safe to pass directly to a Prisma `Decimal` field.
 *
 * Returning a *string* (rather than a JS number) preserves decimal precision
 * across the API → Prisma boundary. Prisma's Decimal constructor accepts
 * strings and stores them as NUMERIC in PostgreSQL without floating-point loss.
 *
 * Returns:
 *   { ok: true;  value: string }                — canonical decimal string
 *   { ok: false; missing: true;  message }      — value was absent
 *   { ok: false; missing: false; message }      — value present but unparseable
 */
export function parseDecimalString(value: unknown):
  | { ok: true; value: string }
  | { ok: false; missing: boolean; message: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: false, missing: true, message: 'is required' };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return { ok: false, missing: false, message: 'must be a finite number' };
    }
    return { ok: true, value: String(value) };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return { ok: false, missing: true, message: 'is required' };
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      return { ok: false, missing: false, message: `"${trimmed}" is not a valid number` };
    }
    return { ok: true, value: trimmed };
  }

  return { ok: false, missing: false, message: 'must be a number or numeric string' };
}

// ─── Integer helpers ──────────────────────────────────────────────────────────

/**
 * Parses a value as a positive integer (> 0, whole number).
 * Accepts JS numbers and numeric strings.
 * Returns the integer, or null if the value is invalid or absent.
 */
export function parsePositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null) return null;

  const n = typeof value === 'number' ? value : Number(String(value).trim());

  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

// ─── Body helpers ─────────────────────────────────────────────────────────────

/**
 * Asserts that a value is a non-null plain object (i.e. a JSON object).
 * Returns the cast object, or null if the assertion fails.
 * Adds an error to result when returning null.
 */
export function assertObject(
  value: unknown,
  result: ValidationResult
): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    result.add('body', 'Request body must be a JSON object');
    return null;
  }
  return value as Record<string, unknown>;
}
