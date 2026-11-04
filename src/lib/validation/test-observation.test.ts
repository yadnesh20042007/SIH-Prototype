import { describe, expect, it } from 'vitest';

import {
  validateTestObservationCreate,
  validateTestObservationUpdate,
  validateBatchTestObservations,
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

  describe('validateBatchTestObservations', () => {
    it('accepts a valid batch payload with mixed observation types and deleted IDs', () => {
      const result = validateBatchTestObservations({
        sessionId: 'session-123',
        deletedIds: ['obs-del-1', 'obs-del-2'],
        observations: [
          {
            clientRowId: 'row-w-1',
            testType: 'WEIGHING_PERFORMANCE',
            sequenceIndex: 0,
            observationData: weighingData,
          },
          {
            id: 'obs-existing-2',
            clientRowId: 'row-rep-1',
            testType: 'REPEATABILITY',
            sequenceIndex: 0,
            observationData: {
              testLoad: 20,
              indications: [20, 20.01, 19.99],
              autoZeroOrTrackingActive: false,
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data?.sessionId).toBe('session-123');
      expect(result.data?.deletedIds).toEqual(['obs-del-1', 'obs-del-2']);
      expect(result.data?.observations).toHaveLength(2);
      expect(result.data?.observations[0].clientRowId).toBe('row-w-1');
      expect(result.data?.observations[1].id).toBe('obs-existing-2');
    });

    it('rejects missing or empty sessionId', () => {
      const result = validateBatchTestObservations({
        sessionId: '  ',
        observations: [],
      });
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({ field: 'sessionId', message: 'must not be empty' });
    });

    it('rejects non-array observations', () => {
      const result = validateBatchTestObservations({
        sessionId: 'session-1',
        observations: 'not-array',
      });
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({ field: 'observations', message: 'must be an array of observation objects' });
    });

    it('identifies item-level validation errors with exact indices', () => {
      const result = validateBatchTestObservations({
        sessionId: 'session-1',
        observations: [
          {
            testType: 'WEIGHING_PERFORMANCE',
            sequenceIndex: 0,
            observationData: { ...weighingData, load: 'not-number' },
          },
        ],
      });
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.field === 'observations[0].observationData.load')).toBe(true);
    });

    it('rejects invalid deletedIds', () => {
      const result = validateBatchTestObservations({
        sessionId: 'session-1',
        observations: [],
        deletedIds: ['valid-id', '  '],
      });
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({ field: 'deletedIds[1]', message: 'must be a non-empty string' });
    });
  });
});
