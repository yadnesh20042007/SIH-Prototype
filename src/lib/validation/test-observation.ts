import {
  assertObject,
  type FieldError,
  ValidationResult,
} from './common';

export const TEST_OBSERVATION_TYPES = [
  'WEIGHING_PERFORMANCE',
  'REPEATABILITY',
  'ECCENTRIC_LOADING',
] as const;

export type TestObservationType = (typeof TEST_OBSERVATION_TYPES)[number];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface TestObservationCreatePayload {
  sessionId: string;
  testType: TestObservationType;
  sequenceIndex?: number;
  observationData: JsonObject;
}

export type TestObservationUpdatePayload = Partial<TestObservationCreatePayload>;

export interface TestObservationValidation<T> {
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

function testType(body: Body, result: ValidationResult): TestObservationType | undefined {
  const value = body.testType;
  if (typeof value !== 'string' || !TEST_OBSERVATION_TYPES.includes(value as TestObservationType)) {
    result.add('testType', `must be one of: ${TEST_OBSERVATION_TYPES.join(', ')}`);
    return undefined;
  }
  return value as TestObservationType;
}

function sequenceIndex(body: Body, result: ValidationResult): number | undefined {
  const value = body.sequenceIndex;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    result.add('sequenceIndex', 'must be an integer');
    return undefined;
  }
  return value;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function finiteNumber(data: Body, field: string, result: ValidationResult): void {
  const value = data[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    result.add(`observationData.${field}`, 'must be a finite number');
  }
}

function optionalFiniteNumber(data: Body, field: string, result: ValidationResult): void {
  if (has(data, field)) finiteNumber(data, field, result);
}

function booleanField(data: Body, field: string, result: ValidationResult): void {
  if (typeof data[field] !== 'boolean') {
    result.add(`observationData.${field}`, 'must be a boolean');
  }
}

function validateWeighing(data: Body, result: ValidationResult): void {
  if (typeof data.sequenceIndex !== 'number' || !Number.isInteger(data.sequenceIndex)) {
    result.add('observationData.sequenceIndex', 'must be an integer');
  }
  finiteNumber(data, 'load', result);
  finiteNumber(data, 'indicatedValue', result);
  optionalFiniteNumber(data, 'additionalLoad', result);
  finiteNumber(data, 'zeroError', result);
  if (data.loadingDirection !== 'increasing' && data.loadingDirection !== 'decreasing') {
    result.add('observationData.loadingDirection', 'must be one of: increasing, decreasing');
  }
}

function validateRepeatability(data: Body, result: ValidationResult): void {
  finiteNumber(data, 'testLoad', result);
  if (!Array.isArray(data.indications)) {
    result.add('observationData.indications', 'must be an array of finite numbers');
  } else if (!data.indications.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    result.add('observationData.indications', 'must contain only finite numbers');
  }
  booleanField(data, 'autoZeroOrTrackingActive', result);
}

function validateEccentric(data: Body, result: ValidationResult): void {
  if (typeof data.positionId !== 'string' || data.positionId.trim() === '') {
    result.add('observationData.positionId', 'must be a non-empty string');
  }
  finiteNumber(data, 'appliedLoad', result);
  finiteNumber(data, 'indicatedValue', result);
  optionalFiniteNumber(data, 'additionalLoad', result);
  finiteNumber(data, 'zeroError', result);
  booleanField(data, 'autoZeroOrTrackingDisabled', result);
  if (has(data, 'zeroDeterminedBeforeEachLoading')) {
    booleanField(data, 'zeroDeterminedBeforeEachLoading', result);
  }
}

function observationData(
  body: Body,
  result: ValidationResult,
  type?: TestObservationType
): JsonObject | undefined {
  const value = body.observationData;
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !isJsonValue(value)) {
    result.add('observationData', 'must be a JSON object');
    return undefined;
  }

  const data = value as JsonObject;
  if (type === 'WEIGHING_PERFORMANCE') validateWeighing(data, result);
  if (type === 'REPEATABILITY') validateRepeatability(data, result);
  if (type === 'ECCENTRIC_LOADING') validateEccentric(data, result);
  return data;
}

function outcome<T>(result: ValidationResult, data: T): TestObservationValidation<T> {
  return result.isValid
    ? { success: true, data, errors: [] }
    : { success: false, errors: result.errors };
}

export function validateTestObservationCreate(
  value: unknown
): TestObservationValidation<TestObservationCreatePayload> {
  const result = new ValidationResult();
  const body = assertObject(value, result);
  if (!body) return { success: false, errors: result.errors };

  const normalizedType = testType(body, result);
  const data: TestObservationCreatePayload = {
    sessionId: requiredId(body, 'sessionId', result) ?? '',
    testType: normalizedType ?? 'WEIGHING_PERFORMANCE',
    observationData: observationData(body, result, normalizedType) ?? {},
  };
  if (has(body, 'sequenceIndex')) {
    const index = sequenceIndex(body, result);
    if (index !== undefined) data.sequenceIndex = index;
  }
  return outcome(result, data);
}

export function validateTestObservationUpdate(
  value: unknown
): TestObservationValidation<TestObservationUpdatePayload> {
  const result = new ValidationResult();
  const body = assertObject(value, result);
  if (!body) return { success: false, errors: result.errors };

  const data: TestObservationUpdatePayload = {};
  if (has(body, 'sessionId')) {
    const id = requiredId(body, 'sessionId', result);
    if (id !== undefined) data.sessionId = id;
  }
  let normalizedType: TestObservationType | undefined;
  if (has(body, 'testType')) {
    normalizedType = testType(body, result);
    if (normalizedType !== undefined) data.testType = normalizedType;
  }
  if (has(body, 'sequenceIndex')) {
    const index = sequenceIndex(body, result);
    if (index !== undefined) data.sequenceIndex = index;
  }
  if (has(body, 'observationData')) {
    const normalizedData = observationData(body, result, normalizedType);
    if (normalizedData !== undefined) data.observationData = normalizedData;
  }
  return outcome(result, data);
}
