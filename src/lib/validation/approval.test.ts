import { describe, expect, it } from 'vitest';

import { APPROVAL_ACTIONS, validateApprovalCreate } from './approval';

describe('Approval validation', () => {
  it('accepts valid create data and trims string fields', () => {
    expect(validateApprovalCreate({
      sessionId: ' session-1 ',
      action: 'REVIEW_APPROVE',
      comments: ' Reviewed evidence ',
      createdAt: '2026-09-06T12:30:00.000Z',
    })).toEqual({
      success: true,
      data: {
        sessionId: 'session-1',
        action: 'REVIEW_APPROVE',
        comments: 'Reviewed evidence',
        createdAt: '2026-09-06T12:30:00.000Z',
      },
      errors: [],
    });
  });

  it.each(APPROVAL_ACTIONS)('accepts existing action %s', (action) => {
    expect(validateApprovalCreate({ sessionId: 's', action }).success).toBe(true);
  });

  it('rejects a missing required session ID', () => {
    const result = validateApprovalCreate({ action: 'SUBMIT_FOR_REVIEW' });
    expect(result.errors.map(({ field }) => field)).toEqual(['sessionId']);
  });

  it('rejects empty and whitespace-only IDs', () => {
    const result = validateApprovalCreate({
      sessionId: '', action: 'SUBMIT_FOR_REVIEW',
    });
    expect(result.errors).toContainEqual({ field: 'sessionId', message: 'must not be empty' });
  });

  it('rejects a session ID of the wrong primitive type', () => {
    const result = validateApprovalCreate({
      sessionId: 12, action: 'SUBMIT_FOR_REVIEW',
    });
    expect(result.errors.map(({ field }) => field)).toEqual(['sessionId']);
  });

  it.each(['userId', 'reviewerId', 'approverId'])('rejects caller-supplied %s identity', (field) => {
    const result = validateApprovalCreate({ sessionId: 's', action: 'REVIEW_APPROVE', [field]: 'fake-user' });
    expect(result.errors).toContainEqual({
      field: 'userId', message: 'actor identity cannot be supplied by the client',
    });
  });

  it('rejects missing and invalid actions', () => {
    expect(validateApprovalCreate({ sessionId: 's', }).success).toBe(false);
    const result = validateApprovalCreate({ sessionId: 's', action: 'APPROVE' });
    expect(result.errors[0].field).toBe('action');
  });

  it('preserves nullable comments', () => {
    expect(validateApprovalCreate({
      sessionId: 's', action: 'CANCEL', comments: null,
    }).data).toMatchObject({ comments: null });
  });

  it('rejects comments of the wrong type', () => {
    const result = validateApprovalCreate({
      sessionId: 's', action: 'CANCEL', comments: 10,
    });
    expect(result.errors).toContainEqual({ field: 'comments', message: 'must be a string or null' });
  });

  it.each(['2026-09-06', 'not-a-date', '2026-13-01T00:00:00Z', 123])(
    'rejects malformed createdAt value %j',
    (createdAt) => {
      const result = validateApprovalCreate({
        sessionId: 's', action: 'CANCEL', createdAt,
      });
      expect(result.errors[0].field).toBe('createdAt');
    }
  );

  it('rejects a non-object payload', () => {
    expect(validateApprovalCreate([]).success).toBe(false);
  });
});
