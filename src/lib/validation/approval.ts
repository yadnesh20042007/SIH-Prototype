import { assertObject, type FieldError, ValidationResult } from './common';

export const APPROVAL_ACTIONS = [
  'SUBMIT_FOR_REVIEW',
  'REVIEW_APPROVE',
  'REVIEW_REJECT',
  'FINAL_APPROVE',
  'FINAL_REJECT',
  'CANCEL',
] as const;

export type ApprovalActionValue = (typeof APPROVAL_ACTIONS)[number];

export interface ApprovalCreatePayload {
  sessionId: string;
  action: ApprovalActionValue;
  comments?: string | null;
  createdAt?: string;
}

export interface ApprovalValidation<T> {
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
  field: 'sessionId',
  errors: FieldError[]
): string | undefined {
  const value = source[field];
  if (!has(source, field) || value === null || value === undefined) {
    errors.push({ field, message: 'is required' });
    return undefined;
  }
  if (typeof value !== 'string') {
    errors.push({ field, message: 'must be a string' });
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    errors.push({ field, message: 'must not be empty' });
    return undefined;
  }
  return trimmed;
}

export function validateApprovalCreate(
  value: unknown
): ApprovalValidation<ApprovalCreatePayload> {
  const result = new ValidationResult();
  const source = assertObject(value, result);
  if (!source) return { success: false, errors: result.errors };

  const sessionId = requiredId(source, 'sessionId', result.errors);
  let action: ApprovalActionValue | undefined;

  if (has(source, 'userId') || has(source, 'reviewerId') || has(source, 'approverId')) {
    result.add('userId', 'actor identity cannot be supplied by the client');
  }

  if (!has(source, 'action') || source.action === null || source.action === undefined) {
    result.add('action', 'is required');
  } else if (
    typeof source.action !== 'string' ||
    !APPROVAL_ACTIONS.includes(source.action as ApprovalActionValue)
  ) {
    result.add('action', `must be one of: ${APPROVAL_ACTIONS.join(', ')}`);
  } else {
    action = source.action as ApprovalActionValue;
  }

  const data: Partial<ApprovalCreatePayload> = {};
  if (sessionId !== undefined) data.sessionId = sessionId;
  if (action !== undefined) data.action = action;

  if (has(source, 'comments')) {
    if (source.comments === null) data.comments = null;
    else if (typeof source.comments !== 'string') {
      result.add('comments', 'must be a string or null');
    } else data.comments = source.comments.trim();
  }

  if (has(source, 'createdAt')) {
    if (typeof source.createdAt !== 'string') {
      result.add('createdAt', 'must be a valid ISO-8601 date-time string');
    } else {
      const createdAt = source.createdAt.trim();
      if (!ISO_DATE_TIME.test(createdAt) || Number.isNaN(Date.parse(createdAt))) {
        result.add('createdAt', 'must be a valid ISO-8601 date-time string');
      } else data.createdAt = createdAt;
    }
  }

  if (!result.isValid) return { success: false, errors: result.errors };
  return { success: true, data: data as ApprovalCreatePayload, errors: [] };
}
