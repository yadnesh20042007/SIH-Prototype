import {
  assertObject,
  type FieldError,
  ValidationResult,
} from "./common";

export const TEST_SESSION_VERIFICATION_CONTEXTS = [
  "INITIAL_VERIFICATION",
  "SUBSEQUENT_VERIFICATION",
  "SERVICE_INSPECTION",
] as const;

export const TEST_SESSION_STATUSES = [
  "DRAFT",
  "IN_PROGRESS",
  "PENDING_REVIEW",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export type TestSessionVerificationContext =
  (typeof TEST_SESSION_VERIFICATION_CONTEXTS)[number];
export type TestSessionStatus = (typeof TEST_SESSION_STATUSES)[number];

export interface TestSessionCreatePayload {
  instrumentId: string;
  verificationContext: TestSessionVerificationContext;
  rulesetVersionId: string;
  technicianId: string;
  status?: TestSessionStatus;
  reviewerId?: string | null;
  approverId?: string | null;
  notes?: string | null;
  completedAt?: string | null;
}

export type TestSessionUpdatePayload = Partial<TestSessionCreatePayload>;

export interface TestSessionValidation<T> {
  success: boolean;
  data?: T;
  errors: FieldError[];
}

const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function has(source: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, field);
}

function requiredId(
  source: Record<string, unknown>,
  field: string,
  errors: FieldError[],
): string | undefined {
  if (!has(source, field) || source[field] === null || source[field] === undefined) {
    errors.push({ field, message: "is required" });
    return undefined;
  }

  if (typeof source[field] !== "string") {
    errors.push({ field, message: "must be a string" });
    return undefined;
  }

  const value = source[field].trim();
  if (value.length === 0) {
    errors.push({ field, message: "must not be empty" });
    return undefined;
  }

  return value;
}

function optionalNullableId(
  source: Record<string, unknown>,
  field: string,
  errors: FieldError[],
): string | null | undefined {
  if (!has(source, field)) return undefined;
  if (source[field] === null) return null;

  if (typeof source[field] !== "string") {
    errors.push({ field, message: "must be a string or null" });
    return undefined;
  }

  const value = source[field].trim();
  if (value.length === 0) {
    errors.push({ field, message: "must not be empty" });
    return undefined;
  }

  return value;
}

function enumValue<T extends readonly string[]>(
  source: Record<string, unknown>,
  field: string,
  values: T,
  errors: FieldError[],
  required: boolean,
): T[number] | undefined {
  if (!has(source, field) || source[field] === undefined || source[field] === null) {
    if (required) errors.push({ field, message: "is required" });
    return undefined;
  }

  if (typeof source[field] !== "string" || !values.includes(source[field] as string)) {
    errors.push({ field, message: `must be one of: ${values.join(", ")}` });
    return undefined;
  }

  return source[field] as T[number];
}

function optionalNullableString(
  source: Record<string, unknown>,
  field: string,
  errors: FieldError[],
): string | null | undefined {
  if (!has(source, field)) return undefined;
  if (source[field] === null) return null;

  if (typeof source[field] !== "string") {
    errors.push({ field, message: "must be a string or null" });
    return undefined;
  }

  return source[field].trim();
}

function optionalNullableDateTime(
  source: Record<string, unknown>,
  field: string,
  errors: FieldError[],
): string | null | undefined {
  if (!has(source, field)) return undefined;
  if (source[field] === null) return null;

  if (typeof source[field] !== "string") {
    errors.push({
      field,
      message: "must be a valid ISO-8601 date-time string or null",
    });
    return undefined;
  }

  const value = source[field].trim();
  if (!ISO_DATE_TIME.test(value) || Number.isNaN(Date.parse(value))) {
    errors.push({
      field,
      message: "must be a valid ISO-8601 date-time string or null",
    });
    return undefined;
  }

  return value;
}

function addOptionalFields(
  source: Record<string, unknown>,
  data: TestSessionUpdatePayload,
  errors: FieldError[],
): void {
  if (has(source, "status")) {
    const status = enumValue(
      source,
      "status",
      TEST_SESSION_STATUSES,
      errors,
      false,
    );
    if (status !== undefined) data.status = status;
  }

  for (const field of ["reviewerId", "approverId"] as const) {
    if (!has(source, field)) continue;
    const value = optionalNullableId(source, field, errors);
    if (value !== undefined) data[field] = value;
  }

  if (has(source, "notes")) {
    const notes = optionalNullableString(source, "notes", errors);
    if (notes !== undefined) data.notes = notes;
  }

  if (has(source, "completedAt")) {
    const completedAt = optionalNullableDateTime(source, "completedAt", errors);
    if (completedAt !== undefined) data.completedAt = completedAt;
  }
}

function outcome<T>(
  result: ValidationResult,
  data: T,
): TestSessionValidation<T> {
  if (!result.isValid) return { success: false, errors: result.errors };
  return { success: true, data, errors: [] };
}

export function validateTestSessionCreate(
  value: unknown,
): TestSessionValidation<TestSessionCreatePayload> {
  const result = new ValidationResult();
  const source = assertObject(value, result);
  if (!source) return { success: false, errors: result.errors };

  const errors = result.errors;
  const instrumentId = requiredId(source, "instrumentId", errors);
  const verificationContext = enumValue(
    source,
    "verificationContext",
    TEST_SESSION_VERIFICATION_CONTEXTS,
    errors,
    true,
  );
  const rulesetVersionId = requiredId(source, "rulesetVersionId", errors);
  const technicianId = requiredId(source, "technicianId", errors);
  const data: TestSessionUpdatePayload = {};

  if (instrumentId !== undefined) data.instrumentId = instrumentId;
  if (verificationContext !== undefined) {
    data.verificationContext = verificationContext;
  }
  if (rulesetVersionId !== undefined) data.rulesetVersionId = rulesetVersionId;
  if (technicianId !== undefined) data.technicianId = technicianId;
  addOptionalFields(source, data, errors);

  return outcome(result, data as TestSessionCreatePayload);
}

export function validateTestSessionUpdate(
  value: unknown,
): TestSessionValidation<TestSessionUpdatePayload> {
  const result = new ValidationResult();
  const source = assertObject(value, result);
  if (!source) return { success: false, errors: result.errors };

  const errors = result.errors;
  const data: TestSessionUpdatePayload = {};

  for (const field of [
    "instrumentId",
    "rulesetVersionId",
    "technicianId",
  ] as const) {
    if (!has(source, field)) continue;
    const id = requiredId(source, field, errors);
    if (id !== undefined) data[field] = id;
  }

  if (has(source, "verificationContext")) {
    const verificationContext = enumValue(
      source,
      "verificationContext",
      TEST_SESSION_VERIFICATION_CONTEXTS,
      errors,
      true,
    );
    if (verificationContext !== undefined) {
      data.verificationContext = verificationContext;
    }
  }

  addOptionalFields(source, data, errors);

  return outcome(result, data);
}
