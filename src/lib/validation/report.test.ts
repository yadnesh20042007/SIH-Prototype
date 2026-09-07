import { describe, expect, it } from 'vitest';
import { validateReportCreate } from './report';

describe('Report validation', () => {
  it('accepts and trims an approved-session case identifier', () => {
    expect(validateReportCreate({ testSessionId: ' session-1 ' })).toEqual({ success: true, data: { testSessionId: 'session-1' }, errors: [] });
  });
  it('rejects a missing session identifier', () => {
    expect(validateReportCreate({}).success).toBe(false);
  });
  it('rejects empty and incorrectly typed session identifiers', () => {
    expect(validateReportCreate({ testSessionId: '   ' }).success).toBe(false);
    expect(validateReportCreate({ testSessionId: 42 }).success).toBe(false);
  });
});
