import {
  assertObject,
  parseDecimalString,
  type FieldError,
  ValidationResult,
} from './common';

export const TEST_RESULT_TYPES = [
  'WEIGHING_PERFORMANCE',
  'REPEATABILITY',
  'ECCENTRIC_LOADING',
] as const;

export const TEST_RESULT_OUTCOMES = ['PASS', 'FAIL', 'REQUIRES_RETEST'] as const;

export type TestResultType = (typeof TEST_RESULT_TYPES)[number];
export type TestResultOutcome = (typeof TEST_RESULT_OUTCOMES)[number];
export type TestResultJsonPrimitive = string | number | boolean | null;
export type TestResultJsonValue =
  | TestResultJsonPrimitive
  | TestResultJsonObject
  | TestResultJsonValue[];
export interface TestResultJsonObject {
  [key: string]: TestResultJsonValue;
}

export interface TestResultCreatePayload {
  sessionId: string;
  testType: TestResultType;
  outcome: TestResultOutcome;
  maxAbsoluteError: string;
  mpe: string;
  repeatabilityRange?: string | null;
  r76Reference: string;
  explanation: string;
  rulesetVersionId: string;
  complianceTrace: TestResultJsonObject;
}

export type TestResultUpdatePayload = Partial<TestResultCreatePayload>;

export interface TestResultValidation<T> {
  success: boolean;
  data?: T;
  errors: FieldError[];
}

type Body = Record<string, unknown>;

function has(body: Body, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function requiredId(body: Body, field: string, result: ValidationResult): string | undefined {
  const value = body[field];
  if (typeof value !== 'string') {
    result.add(field, value === undefined || value === null ? 'is required' : 'must be a string');
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    result.add(field, 'must not be empty');
    return undefined;
  }
  return trimmed;
}

function requiredString(body: Body, field: string, result: ValidationResult): string | undefined {
  const value = body[field];
  if (typeof value !== 'string') {
    result.add(field, value === undefined || value === null ? 'is required' : 'must be a string');
    return undefined;
  }
  if (value.trim() === '') {
    result.add(field, 'must not be empty');
    return undefined;
  }
  return value;
}

function enumValue<T extends string>(
  body: Body,
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

function decimal(
  body: Body,
  field: string,
  result: ValidationResult,
  nullable = false
): string | null | undefined {
  if (nullable && body[field] === null) return null;
  const parsed = parseDecimalString(body[field]);
  if (!parsed.ok) {
    result.add(field, parsed.message);
    return undefined;
  }
  return parsed.value;
}

function isPlainObject(value: unknown): value is Body {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function addTypeError(result: ValidationResult, path: string, expected: string): void {
  result.add(path, `must be ${expected}`);
}

function stringField(body: Body, field: string, path: string, result: ValidationResult): void {
  if (typeof body[field] !== 'string') addTypeError(result, path, 'a string');
}

function finiteNumberField(body: Body, field: string, path: string, result: ValidationResult): void {
  if (typeof body[field] !== 'number' || !Number.isFinite(body[field])) {
    addTypeError(result, path, 'a finite number');
  }
}

function validateReference(value: unknown, path: string, result: ValidationResult): void {
  if (!isPlainObject(value)) {
    addTypeError(result, path, 'an object');
    return;
  }
  if (value.document !== 'OIML R 76-1:2006 (E)') {
    result.add(`${path}.document`, 'must be OIML R 76-1:2006 (E)');
  }
  for (const field of ['clause', 'table', 'annex'] as const) {
    if (has(value, field) && typeof value[field] !== 'string') {
      addTypeError(result, `${path}.${field}`, 'a string');
    }
  }
  stringField(value, 'purpose', `${path}.purpose`, result);
}

function validatePrimitiveRecord(
  value: unknown,
  path: string,
  allowed: readonly string[],
  result: ValidationResult
): void {
  if (!isPlainObject(value)) {
    addTypeError(result, path, 'an object');
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.includes(typeof item) || (typeof item === 'number' && !Number.isFinite(item))) {
      result.add(`${path}.${key}`, `must be a ${allowed.join(' or ')}`);
    }
  }
}

function validateComplianceTrace(value: unknown, result: ValidationResult): TestResultJsonObject | undefined {
  if (!isPlainObject(value)) {
    result.add('complianceTrace', 'must be a JSON object');
    return undefined;
  }

  validatePrimitiveRecord(
    value.instrumentContext,
    'complianceTrace.instrumentContext',
    ['string', 'number', 'boolean'],
    result
  );
  validatePrimitiveRecord(value.inputs, 'complianceTrace.inputs', ['string', 'number'], result);

  if (!Array.isArray(value.references)) {
    addTypeError(result, 'complianceTrace.references', 'an array');
  } else {
    value.references.forEach((reference, index) =>
      validateReference(reference, `complianceTrace.references.${index}`, result)
    );
  }

  if (!Array.isArray(value.calculationSteps)) {
    addTypeError(result, 'complianceTrace.calculationSteps', 'an array');
  } else {
    value.calculationSteps.forEach((step, index) => {
      const path = `complianceTrace.calculationSteps.${index}`;
      if (!isPlainObject(step)) {
        addTypeError(result, path, 'an object');
        return;
      }
      stringField(step, 'label', `${path}.label`, result);
      stringField(step, 'formula', `${path}.formula`, result);
      stringField(step, 'substitutedFormula', `${path}.substitutedFormula`, result);
      finiteNumberField(step, 'result', `${path}.result`, result);
      stringField(step, 'unit', `${path}.unit`, result);
      if (has(step, 'reference')) validateReference(step.reference, `${path}.reference`, result);
    });
  }

  if (!isPlainObject(value.mpeTrace)) {
    addTypeError(result, 'complianceTrace.mpeTrace', 'an object');
  } else {
    const mpeTrace = value.mpeTrace;
    for (const field of [
      'accuracyClass',
      'tableBand',
      'mpeFactor',
      'verificationContext',
    ] as const) {
      stringField(mpeTrace, field, `complianceTrace.mpeTrace.${field}`, result);
    }
    for (const field of [
      'load',
      'e',
      'loadOverE',
      'baseMPE',
      'contextMultiplier',
      'effectiveMPE',
    ] as const) {
      finiteNumberField(mpeTrace, field, `complianceTrace.mpeTrace.${field}`, result);
    }
    validateReference(mpeTrace.reference, 'complianceTrace.mpeTrace.reference', result);
  }

  if (!isPlainObject(value.comparison)) {
    addTypeError(result, 'complianceTrace.comparison', 'an object');
  } else {
    stringField(value.comparison, 'formula', 'complianceTrace.comparison.formula', result);
    stringField(value.comparison, 'substituted', 'complianceTrace.comparison.substituted', result);
    if (typeof value.comparison.passed !== 'boolean') {
      addTypeError(result, 'complianceTrace.comparison.passed', 'a boolean');
    }
  }

  if (!['pass', 'fail', 'requires_retest'].includes(String(value.outcome))) {
    result.add('complianceTrace.outcome', 'must be one of: pass, fail, requires_retest');
  }

  return value as TestResultJsonObject;
}

function validationOutcome<T>(result: ValidationResult, data: T): TestResultValidation<T> {
  return result.isValid
    ? { success: true, data, errors: [] }
    : { success: false, errors: result.errors };
}

export function validateTestResultCreate(
  value: unknown
): TestResultValidation<TestResultCreatePayload> {
  const result = new ValidationResult();
  const body = assertObject(value, result);
  if (!body) return { success: false, errors: result.errors };

  const data: TestResultCreatePayload = {
    sessionId: requiredId(body, 'sessionId', result) ?? '',
    testType: enumValue(body, 'testType', TEST_RESULT_TYPES, result) ?? 'WEIGHING_PERFORMANCE',
    outcome: enumValue(body, 'outcome', TEST_RESULT_OUTCOMES, result) ?? 'FAIL',
    maxAbsoluteError: decimal(body, 'maxAbsoluteError', result) ?? '',
    mpe: decimal(body, 'mpe', result) ?? '',
    r76Reference: requiredString(body, 'r76Reference', result) ?? '',
    explanation: requiredString(body, 'explanation', result) ?? '',
    rulesetVersionId: requiredId(body, 'rulesetVersionId', result) ?? '',
    complianceTrace: validateComplianceTrace(body.complianceTrace, result) ?? {},
  };
  if (has(body, 'repeatabilityRange')) {
    const range = decimal(body, 'repeatabilityRange', result, true);
    if (range !== undefined) data.repeatabilityRange = range;
  }
  return validationOutcome(result, data);
}

export function validateTestResultUpdate(
  value: unknown
): TestResultValidation<TestResultUpdatePayload> {
  const result = new ValidationResult();
  const body = assertObject(value, result);
  if (!body) return { success: false, errors: result.errors };

  const data: TestResultUpdatePayload = {};
  if (has(body, 'sessionId')) data.sessionId = requiredId(body, 'sessionId', result) ?? '';
  if (has(body, 'testType')) {
    const normalized = enumValue(body, 'testType', TEST_RESULT_TYPES, result);
    if (normalized) data.testType = normalized;
  }
  if (has(body, 'outcome')) {
    const normalized = enumValue(body, 'outcome', TEST_RESULT_OUTCOMES, result);
    if (normalized) data.outcome = normalized;
  }
  for (const field of ['maxAbsoluteError', 'mpe'] as const) {
    if (has(body, field)) {
      const normalized = decimal(body, field, result);
      if (typeof normalized === 'string') data[field] = normalized;
    }
  }
  if (has(body, 'repeatabilityRange')) {
    const normalized = decimal(body, 'repeatabilityRange', result, true);
    if (normalized !== undefined) data.repeatabilityRange = normalized;
  }
  for (const field of ['r76Reference', 'explanation'] as const) {
    if (has(body, field)) {
      const normalized = requiredString(body, field, result);
      if (normalized !== undefined) data[field] = normalized;
    }
  }
  if (has(body, 'rulesetVersionId')) {
    data.rulesetVersionId = requiredId(body, 'rulesetVersionId', result) ?? '';
  }
  if (has(body, 'complianceTrace')) {
    const trace = validateComplianceTrace(body.complianceTrace, result);
    if (trace) data.complianceTrace = trace;
  }
  return validationOutcome(result, data);
}
