import { describe, expect, it } from 'vitest';

import { validateTestResultCreate, validateTestResultUpdate } from './test-result';

const reference = {
  document: 'OIML R 76-1:2006 (E)',
  clause: '3.5.1',
  purpose: 'Verified engine reference',
};

const complianceTrace = {
  instrumentContext: { accuracyClass: 'III', max: 30, tracking: false },
  references: [reference],
  inputs: { load: 10, direction: 'increasing' },
  calculationSteps: [{
    label: 'Error',
    formula: 'E = I - L',
    substitutedFormula: 'E = 10.001 - 10',
    result: 0.001,
    unit: 'kg',
    reference,
  }],
  mpeTrace: {
    accuracyClass: 'III',
    load: 10,
    e: 0.01,
    loadOverE: 1000,
    tableBand: '500e < m <= 2000e',
    mpeFactor: '1.0e',
    baseMPE: 0.01,
    verificationContext: 'Initial Verification',
    contextMultiplier: 1,
    effectiveMPE: 0.01,
    reference,
  },
  comparison: { formula: '|E| <= MPE', substituted: '0.001 <= 0.01', passed: true },
  outcome: 'pass',
};

const validCreate = {
  sessionId: 'session-1',
  testType: 'WEIGHING_PERFORMANCE',
  outcome: 'PASS',
  maxAbsoluteError: '0.00100000',
  mpe: '0.01000000',
  r76Reference: 'R76-2 §4.2',
  explanation: 'Engine-produced explanation.',
  rulesetVersionId: 'ruleset-1',
  complianceTrace,
};

describe('TestResult validation', () => {
  it('accepts valid create data and trims IDs while preserving decimals and trace', () => {
    expect(validateTestResultCreate({
      ...validCreate,
      sessionId: ' session-1 ',
      rulesetVersionId: ' ruleset-1 ',
    })).toEqual({
      success: true,
      data: validCreate,
      errors: [],
    });
  });

  it('accepts the current prototype test types and outcomes', () => {
    for (const testType of ['WEIGHING_PERFORMANCE', 'REPEATABILITY', 'ECCENTRIC_LOADING']) {
      for (const outcome of ['PASS', 'FAIL', 'REQUIRES_RETEST']) {
        expect(validateTestResultCreate({ ...validCreate, testType, outcome }).success).toBe(true);
      }
    }
  });

  it('rejects missing and whitespace-only IDs', () => {
    const validation = validateTestResultCreate({
      ...validCreate,
      sessionId: ' ',
      rulesetVersionId: undefined,
    });
    expect(validation.errors).toContainEqual({ field: 'sessionId', message: 'must not be empty' });
    expect(validation.errors).toContainEqual({ field: 'rulesetVersionId', message: 'is required' });
  });

  it('rejects invalid enum values', () => {
    const validation = validateTestResultCreate({
      ...validCreate,
      testType: 'LINEARITY',
      outcome: 'INCOMPLETE',
    });
    expect(validation.errors.map(({ field }) => field)).toEqual(['testType', 'outcome']);
  });

  it('rejects wrong decimal primitive types', () => {
    const validation = validateTestResultCreate({
      ...validCreate,
      maxAbsoluteError: {},
      mpe: false,
    });
    expect(validation.errors.map(({ field }) => field)).toEqual(['maxAbsoluteError', 'mpe']);
  });

  it('preserves nullable repeatabilityRange behavior', () => {
    expect(validateTestResultCreate({ ...validCreate, repeatabilityRange: null }).data)
      .toMatchObject({ repeatabilityRange: null });
    expect(validateTestResultCreate({ ...validCreate, repeatabilityRange: '0.00000001' }).data)
      .toMatchObject({ repeatabilityRange: '0.00000001' });
  });

  it.each([null, [], 'trace', 42])('rejects non-object Compliance Trace: %j', (value) => {
    const validation = validateTestResultCreate({ ...validCreate, complianceTrace: value });
    expect(validation.errors).toContainEqual({
      field: 'complianceTrace',
      message: 'must be a JSON object',
    });
  });

  it('rejects structurally invalid Compliance Trace fields', () => {
    const validation = validateTestResultCreate({
      ...validCreate,
      complianceTrace: {
        ...complianceTrace,
        comparison: { ...complianceTrace.comparison, passed: 'yes' },
        calculationSteps: [{ ...complianceTrace.calculationSteps[0], result: '0.001' }],
      },
    });
    expect(validation.errors.map(({ field }) => field)).toContain(
      'complianceTrace.comparison.passed'
    );
    expect(validation.errors.map(({ field }) => field)).toContain(
      'complianceTrace.calculationSteps.0.result'
    );
  });

  it('does not rewrite engine-generated Compliance Trace content', () => {
    const validation = validateTestResultCreate(validCreate);
    expect(validation.data?.complianceTrace).toBe(complianceTrace);
  });

  it('accepts an empty partial update', () => {
    expect(validateTestResultUpdate({})).toEqual({ success: true, data: {}, errors: [] });
  });

  it('accepts and normalizes a valid partial update', () => {
    expect(validateTestResultUpdate({
      outcome: 'REQUIRES_RETEST',
      mpe: ' 0.02000000 ',
      repeatabilityRange: null,
    })).toEqual({
      success: true,
      data: { outcome: 'REQUIRES_RETEST', mpe: '0.02000000', repeatabilityRange: null },
      errors: [],
    });
  });

  it('rejects invalid supplied update fields without requiring omitted fields', () => {
    const validation = validateTestResultUpdate({ sessionId: 12, outcome: 'pass' });
    expect(validation.success).toBe(false);
    expect(validation.errors.map(({ field }) => field)).toEqual(['sessionId', 'outcome']);
  });

  it('rejects a non-object update payload', () => {
    expect(validateTestResultUpdate([]).success).toBe(false);
  });
});
