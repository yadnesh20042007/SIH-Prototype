/** Structural validation for Instrument API payloads. */

import {
  assertObject,
  type FieldError,
  parseDecimalString,
  parsePositiveInteger,
  ValidationResult,
} from './common';

export const INSTRUMENT_ACCURACY_CLASSES = ['I', 'II', 'III', 'IIII'] as const;
export const INSTRUMENT_TYPES = ['SINGLE_RANGE', 'MULTI_RANGE', 'MULTI_INTERVAL'] as const;

export type InstrumentAccuracyClass = (typeof INSTRUMENT_ACCURACY_CLASSES)[number];
export type PrismaInstrumentType = (typeof INSTRUMENT_TYPES)[number];

export interface InstrumentCreatePayload {
  manufacturerId: string;
  model: string;
  serialNumber?: string | null;
  accuracyClass: InstrumentAccuracyClass;
  instrumentType?: PrismaInstrumentType;
  max: string;
  min: string;
  e: string;
  d: string;
  numberOfSupportPoints?: number;
  additiveTareEffect?: boolean;
  hasAutoZeroOrTracking?: boolean;
  hasInitialZeroSettingDevice?: boolean;
  initialZeroSettingRange?: string;
  hasFineDisplayDevice?: boolean;
}

export type InstrumentUpdatePayload = Partial<InstrumentCreatePayload>;

export interface InstrumentValidation<T> {
  success: boolean;
  data?: T;
  errors: FieldError[];
}

type Payload = Record<string, unknown>;

function has(body: Payload, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function requiredString(body: Payload, field: string, result: ValidationResult): string | undefined {
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

function nullableString(body: Payload, field: string, result: ValidationResult): string | null | undefined {
  const value = body[field];
  if (value === null) return null;
  if (typeof value !== 'string') {
    result.add(field, 'must be a string or null');
    return undefined;
  }
  return value.trim();
}

function enumValue<T extends string>(
  body: Payload,
  field: string,
  values: readonly T[],
  result: ValidationResult
): T | undefined {
  const value = body[field];
  if (typeof value !== 'string' || !values.includes(value as T)) {
    result.add(field, `must be one of: ${values.join(', ')}`);
    return undefined;
  }
  return value as T;
}

function decimalValue(body: Payload, field: string, result: ValidationResult): string | undefined {
  const parsed = parseDecimalString(body[field]);
  if (!parsed.ok) {
    result.add(field, parsed.message);
    return undefined;
  }
  return parsed.value;
}

/**
 * Compares valid decimal strings exactly, including exponent notation, without
 * converting their significant digits to JavaScript floating point.
 */
function compareDecimals(left: string, right: string): number {
  const normalize = (value: string) => {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(value);
    if (!match) return { sign: 0, magnitude: 0, digits: '' };

    const [, signToken, integer = '', fraction = '', exponentToken = '0'] = match;
    const combined = `${integer}${fraction}`;
    const firstNonZero = combined.search(/[1-9]/);
    if (firstNonZero === -1) return { sign: 0, magnitude: 0, digits: '' };

    return {
      sign: signToken === '-' ? -1 : 1,
      magnitude: integer.length + Number(exponentToken) - firstNonZero,
      digits: combined.slice(firstNonZero).replace(/0+$/, ''),
    };
  };

  const a = normalize(left);
  const b = normalize(right);
  if (a.sign !== b.sign) return a.sign < b.sign ? -1 : 1;
  if (a.sign === 0) return 0;

  let comparison = 0;
  if (a.magnitude !== b.magnitude) {
    comparison = a.magnitude < b.magnitude ? -1 : 1;
  } else {
    const width = Math.max(a.digits.length, b.digits.length);
    const aDigits = a.digits.padEnd(width, '0');
    const bDigits = b.digits.padEnd(width, '0');
    comparison = aDigits === bDigits ? 0 : aDigits < bDigits ? -1 : 1;
  }
  return a.sign === -1 ? -comparison : comparison;
}

function positiveDecimal(
  body: Payload,
  field: string,
  result: ValidationResult,
  allowZero: boolean
): string | undefined {
  const value = decimalValue(body, field, result);
  if (value === undefined) return undefined;

  const comparison = compareDecimals(value, '0');
  if (comparison < 0 || (!allowZero && comparison === 0)) {
    result.add(field, allowZero ? 'must be greater than or equal to 0' : 'must be greater than 0');
    return undefined;
  }
  return value;
}

function booleanValue(body: Payload, field: string, result: ValidationResult): boolean | undefined {
  const value = body[field];
  if (typeof value !== 'boolean') {
    result.add(field, 'must be a boolean');
    return undefined;
  }
  return value;
}

function supportPoints(body: Payload, result: ValidationResult): number | undefined {
  const value = parsePositiveInteger(body.numberOfSupportPoints);
  if (value === null) {
    result.add('numberOfSupportPoints', 'must be a positive integer');
    return undefined;
  }
  return value;
}

function validateMinLessThanMax(data: InstrumentUpdatePayload, result: ValidationResult): void {
  if (
    data.min !== undefined &&
    data.min !== '' &&
    data.max !== undefined &&
    data.max !== '' &&
    compareDecimals(data.min, data.max) >= 0
  ) {
    result.add('min', 'must be less than max');
  }
}

function optionalFields(body: Payload, data: InstrumentUpdatePayload, result: ValidationResult): void {
  if (has(body, 'serialNumber')) {
    const value = nullableString(body, 'serialNumber', result);
    if (value !== undefined) data.serialNumber = value;
  }

  if (has(body, 'instrumentType')) {
    const value = enumValue(body, 'instrumentType', INSTRUMENT_TYPES, result);
    if (value !== undefined) data.instrumentType = value;
  }

  if (has(body, 'numberOfSupportPoints')) {
    const value = supportPoints(body, result);
    if (value !== undefined) data.numberOfSupportPoints = value;
  }

  for (const field of [
    'additiveTareEffect',
    'hasAutoZeroOrTracking',
    'hasInitialZeroSettingDevice',
    'hasFineDisplayDevice',
  ] as const) {
    if (!has(body, field)) continue;
    const value = booleanValue(body, field, result);
    if (value !== undefined) data[field] = value;
  }

  if (has(body, 'initialZeroSettingRange')) {
    const value = decimalValue(body, 'initialZeroSettingRange', result);
    if (value !== undefined) data.initialZeroSettingRange = value;
  }
}

function outcome<T>(result: ValidationResult, data: T): InstrumentValidation<T> {
  if (!result.isValid) return { success: false, errors: result.errors };
  return { success: true, data, errors: [] };
}

export function validateInstrumentCreate(value: unknown): InstrumentValidation<InstrumentCreatePayload> {
  const result = new ValidationResult();
  const body = assertObject(value, result);
  if (!body) return { success: false, errors: result.errors };

  const data: InstrumentCreatePayload = {
    manufacturerId: requiredString(body, 'manufacturerId', result) ?? '',
    model: requiredString(body, 'model', result) ?? '',
    accuracyClass: enumValue(body, 'accuracyClass', INSTRUMENT_ACCURACY_CLASSES, result) ?? 'I',
    max: positiveDecimal(body, 'max', result, false) ?? '',
    min: positiveDecimal(body, 'min', result, true) ?? '',
    e: positiveDecimal(body, 'e', result, false) ?? '',
    d: positiveDecimal(body, 'd', result, false) ?? '',
  };

  optionalFields(body, data, result);
  validateMinLessThanMax(data, result);
  return outcome(result, data);
}

export function validateInstrumentUpdate(value: unknown): InstrumentValidation<InstrumentUpdatePayload> {
  const result = new ValidationResult();
  const body = assertObject(value, result);
  if (!body) return { success: false, errors: result.errors };

  const data: InstrumentUpdatePayload = {};

  for (const field of ['manufacturerId', 'model'] as const) {
    if (!has(body, field)) continue;
    const value = requiredString(body, field, result);
    if (value !== undefined) data[field] = value;
  }

  if (has(body, 'accuracyClass')) {
    const value = enumValue(body, 'accuracyClass', INSTRUMENT_ACCURACY_CLASSES, result);
    if (value !== undefined) data.accuracyClass = value;
  }

  for (const [field, allowZero] of [
    ['max', false],
    ['min', true],
    ['e', false],
    ['d', false],
  ] as const) {
    if (!has(body, field)) continue;
    const value = positiveDecimal(body, field, result, allowZero);
    if (value !== undefined) data[field] = value;
  }

  optionalFields(body, data, result);
  validateMinLessThanMax(data, result);
  return outcome(result, data);
}
