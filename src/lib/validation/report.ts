import { assertObject, type FieldError, ValidationResult } from '@/lib/validation/common';

export interface ReportCreatePayload { testSessionId: string }
export interface ReportValidationResult {
  success: boolean;
  data?: ReportCreatePayload;
  errors: FieldError[];
}

export function validateReportCreate(value: unknown): ReportValidationResult {
  const result = new ValidationResult();
  const body = assertObject(value, result);
  if (!body) return { success: false, errors: result.errors };
  if (typeof body.testSessionId !== 'string') {
    result.add('testSessionId', body.testSessionId == null ? 'is required' : 'must be a string');
    return { success: false, errors: result.errors };
  }
  const testSessionId = body.testSessionId.trim();
  if (!testSessionId) {
    result.add('testSessionId', 'must not be empty');
    return { success: false, errors: result.errors };
  }
  return { success: true, data: { testSessionId }, errors: [] };
}
