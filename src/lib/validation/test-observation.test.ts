import { describe, expect, it } from 'vitest';

import {
  validateTestObservationCreate,
  validateTestObservationUpdate,
} from './test-observation';

const weighingData = {
  sequenceIndex: 0,
  load: 10,
  indicatedValue: 10.01,
  additionalLoad: 0,
  zeroError: 0,
  loadingDirection: 'increasing',
};

describe('TestObservation validation', () => {
  it('accepts and normalizes a valid weighing-performance create payload', () => {
    expect(validateTestObservationCreate({
      sessionId: ' session-1 ',
      testType: 'WEIGHING_PERFORMANCE',
      sequenceIndex: 0,
      observationData: weighingData,
    })).toEqual({
      success: true,
      data: {
        sessionId: 'session-1',
        testType: 'WEIGHING_PERFORMANCE',
        sequenceIndex: 0,
        observationData: weighingData,
      },
      errors: [],
    });
  });

  it('accepts a structurally valid repeatability observation', () => {
    expect(validateTestObservationCreate({
      sessionId: 'session-1',
      testType: 'REPEATABILITY',
      observationData: {
        testLoad: 20,
        indications: [20, 20.01, 19.99],
        autoZeroOrTrackingActive: true,
      },
    }).success).toBe(true);
  });

  it('accepts a structurally valid eccentric-loading observation', () => {
    expect(validateTestObservationCreate({
      sessionId: 'session-1',
      testType: 'ECCENTRIC_LOADING',
      observationData: {
        positionId: 'front-left',
        appliedLoad: 10,
        indicatedValue: 10.01,
        zeroError: 0,
        autoZeroOrTrackingDisabled: false,
      },
    }).success).toBe(true);
  });

  it('rejects a missing session ID', () => {
    const result = validateTestObservationCreate({
      testType: 'WEIGHING_PERFORMANCE',
      observationData: weighingData,
    });
    expect(result.errors).toContainEqual({ field: 'sessionId', message: 'is required' });
  });

  it('rejects an empty session ID', () => {
    const result = validateTestObservationCreate({
      sessionId: '  ',
      testType: 'WEIGHING_PERFORMANCE',
      observationData: weighingData,
    });
    expect(result.errors).toContainEqual({ field: 'sessionId', message: 'must not be empty' });
  });

  it('rejects an invalid test type', () => {
    const result = validateTestObservationCreate({
      sessionId: 'session-1',
      testType: 'LINEARITY',
      observationData: weighingData,
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]?.field).toBe('testType');
  });

  it('rejects a wrong sequence-index type', () => {
    const result = validateTestObservationCreate({
      sessionId: 'session-1',
      testType: 'WEIGHING_PERFORMANCE',
      sequenceIndex: '0',
      observationData: weighingData,
    });
    expect(result.errors).toContainEqual({ field: 'sequenceIndex', message: 'must be an integer' });
  });

  it.each([null, [], 'data', 42])('rejects non-object observationData: %j', (value) => {
    const result = validateTestObservationCreate({
      sessionId: 'session-1',
      testType: 'WEIGHING_PERFORMANCE',
      observationData: value,
    });
    expect(result.errors).toContainEqual({ field: 'observationData', message: 'must be a JSON object' });
  });

  it('rejects incorrect weighing-performance field types', () => {
    const result = validateTestObservationCreate({
      sessionId: 'session-1',
      testType: 'WEIGHING_PERFORMANCE',
      observationData: { ...weighingData, load: '10', loadingDirection: 'up' },
    });
    expect(result.errors.map(({ field }) => field)).toContain('observationData.load');
    expect(result.errors.map(({ field }) => field)).toContain('observationData.loadingDirection');
  });

  it('rejects incorrect repeatability field types', () => {
    const result = validateTestObservationCreate({
      sessionId: 'session-1',
      testType: 'REPEATABILITY',
      observationData: {
        testLoad: 10,
        indications: [10, '10.1'],
        autoZeroOrTrackingActive: 'yes',
      },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('rejects incorrect eccentric-loading field types', () => {
    const result = validateTestObservationCreate({
      sessionId: 'session-1',
      testType: 'ECCENTRIC_LOADING',
      observationData: {
        positionId: ' ',
        appliedLoad: 10,
        indicatedValue: 10,
        zeroError: 0,
        autoZeroOrTrackingDisabled: null,
      },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('accepts an empty partial update', () => {
    expect(validateTestObservationUpdate({})).toEqual({ success: true, data: {}, errors: [] });
  });

  it('accepts a partial observationData update without requiring other fields', () => {
    const observationData = { technicianEntry: ['preserved', 1, true, null] };
    expect(validateTestObservationUpdate({ observationData })).toEqual({
      success: true,
      data: { observationData },
      errors: [],
    });
  });

  it('validates type-specific data when testType and observationData are updated together', () => {
    const result = validateTestObservationUpdate({
      testType: 'REPEATABILITY',
      observationData: { testLoad: 10, indications: [], autoZeroOrTrackingActive: false },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid supplied update fields', () => {
    const result = validateTestObservationUpdate({ sessionId: 1, testType: 'UNKNOWN' });
    expect(result.success).toBe(false);
    expect(result.errors.map(({ field }) => field)).toEqual(['sessionId', 'testType']);
  });

  it('rejects a non-object update payload', () => {
    expect(validateTestObservationUpdate([]).success).toBe(false);
  });
});
