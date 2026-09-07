import { describe, expect, it } from 'vitest';

import { TestOutcome, TestType } from '@/lib/r76/types';
import { observationStateSignature, toTestResultPersistenceData } from './result-persistence';

const trace = {
  instrumentContext: { class: 'III' },
  references: [],
  inputs: { load: 10 },
  calculationSteps: [],
  mpeTrace: {
    accuracyClass: 'III', load: 10, e: 0.01, loadOverE: 1000, tableBand: 'band',
    mpeFactor: '1e', baseMPE: 0.01, verificationContext: 'Initial',
    contextMultiplier: 1, effectiveMPE: 0.01,
    reference: { document: 'OIML R 76-1:2006 (E)' as const, purpose: 'MPE' },
  },
  comparison: { formula: '|E| <= MPE', substituted: '0 <= 0.01', passed: true },
  outcome: TestOutcome.Pass,
};

const selection = {
  testType: TestType.Repeatability,
  isApplicable: true,
  reason: 'Selected by engine',
  r76Reference: 'R76',
  prerequisites: [],
};

describe('engine result persistence mapping', () => {
  it('returns null when the engine produced no result', () => {
    expect(toTestResultPersistenceData({
      testType: TestType.Repeatability, selection, status: 'incomplete',
    })).toBeNull();
  });

  it('maps repeatability values and preserves its trace object', () => {
    const result = toTestResultPersistenceData({
      testType: TestType.Repeatability,
      selection,
      status: 'passed',
      result: {
        outcome: TestOutcome.Pass,
        maxAbsoluteError: 0.001,
        observationResults: [],
        repeatabilityRange: 0.001,
        r76Reference: 'R76 repeatability',
        explanation: 'Engine explanation',
        testLoad: 10,
        numberOfWeighings: 3,
        iMax: 10.001,
        iMin: 10,
        mpe: 0.01,
        trace,
      },
    });
    expect(result).toMatchObject({
      testType: 'REPEATABILITY', outcome: 'PASS', maxAbsoluteError: '0.001',
      mpe: '0.01', repeatabilityRange: '0.001',
    });
    expect(result?.complianceTrace).toBe(trace);
  });

  it('uses the decisive engine-reported observation without rewriting its trace', () => {
    const passingTrace = { ...trace };
    const failingTrace = {
      ...trace,
      comparison: { ...trace.comparison, passed: false },
      outcome: TestOutcome.Fail,
    };
    const result = toTestResultPersistenceData({
      testType: TestType.WeighingPerformance,
      selection: { ...selection, testType: TestType.WeighingPerformance },
      status: 'failed',
      result: {
        outcome: TestOutcome.Fail,
        maxAbsoluteError: 0.02,
        r76Reference: 'R76 weighing',
        explanation: 'Engine failure',
        traces: [passingTrace, failingTrace],
        observationResults: [
          {
            calculatedError: 0.001, mpe: 0.01, outcome: TestOutcome.Pass,
            r76Reference: 'R76', explanation: 'Pass', trace: passingTrace,
            indicationPriorToRounding: 1, errorPriorToRounding: 0.001,
          },
          {
            calculatedError: 0.02, mpe: 0.01, outcome: TestOutcome.Fail,
            r76Reference: 'R76', explanation: 'Fail', trace: failingTrace,
            indicationPriorToRounding: 10.02, errorPriorToRounding: 0.02,
          },
        ],
      },
    });
    expect(result).toMatchObject({
      testType: 'WEIGHING_PERFORMANCE', outcome: 'FAIL', mpe: '0.01',
    });
    expect(result?.complianceTrace).toBe(failingTrace);
  });
});

describe('observation freshness signature', () => {
  it('normalizes equivalent numeric form strings', () => {
    const weighing = [{
      id: 'w-1', load: '10.0', indicatedValue: '10.010', additionalLoad: '0',
      zeroError: '0.000', loadingDirection: 'increasing' as const,
    }];
    const repeatability = {
      testLoad: '10.0', indications: ['10', '10.010', '9.99'],
      autoZeroOrTrackingActive: true,
    };
    const eccentric = [{
      id: 'e-1', positionId: ' position-1 ', appliedLoad: '10.0', indicatedValue: '10',
      additionalLoad: '0.0050', zeroError: '0', autoZeroOrTrackingDisabled: true,
    }];
    expect(observationStateSignature(weighing, repeatability, eccentric, false)).toBe(
      observationStateSignature(
        [{ ...weighing[0], load: '10', indicatedValue: '10.01', zeroError: '0' }],
        { ...repeatability, testLoad: '10', indications: ['10.0', '10.01', '9.990'] },
        [{ ...eccentric[0], positionId: 'position-1', appliedLoad: '10', additionalLoad: '0.005' }],
        false
      )
    );
  });

  it('changes when an observation input changes', () => {
    const weighing = [{
      id: 'w-1', load: '10', indicatedValue: '10.01', additionalLoad: '0',
      zeroError: '0', loadingDirection: 'increasing' as const,
    }];
    const repeatability = {
      testLoad: '', indications: ['', '', ''], autoZeroOrTrackingActive: true,
    };
    const eccentric = [{
      id: 'e-1', positionId: 'position-1', appliedLoad: '', indicatedValue: '',
      additionalLoad: '0', zeroError: '0', autoZeroOrTrackingDisabled: true,
    }];
    expect(observationStateSignature(weighing, repeatability, eccentric, false)).not.toBe(
      observationStateSignature(
        [{ ...weighing[0], indicatedValue: '10.02' }], repeatability, eccentric, false
      )
    );
  });
});
