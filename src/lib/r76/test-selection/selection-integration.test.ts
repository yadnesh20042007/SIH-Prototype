/**
 * @file selection-integration.test.ts
 * @description Integration tests: test-selection engine -> R76 orchestration engine.
 *
 * Tests that:
 * 1. Different supported instrument configurations select the correct tests.
 * 2. Non-applicable tests are excluded from evaluation (marked manual_review).
 * 3. Evaluation using the selection result produces the expected overall outcome.
 * 4. Existing supported behaviour (3-test standard instrument) remains intact.
 */

import { describe, it, expect } from 'vitest';
import { selectTests } from './index';
import { evaluateInstrumentCompliance, OverallOutcome, type TestObservations } from '@/lib/r76/engine';
import { AccuracyClass, InstrumentType, type Instrument } from '@/lib/r76/types/instrument';
import { VerificationContext } from '@/lib/r76/types/verification';
import { TestType } from '@/lib/r76/types/test';

// Fixtures

const standardInstrument: Instrument = {
  id: 'std-001',
  manufacturer: 'TestCo',
  model: 'Standard-III',
  accuracyClass: AccuracyClass.III,
  max: 15000,
  min: 100,
  e: 5,
  d: 5,
  numberOfSupportPoints: 4,
  additiveTareEffect: false,
  hasAutoZeroOrTracking: false,
  hasInitialZeroSettingDevice: false,
  initialZeroSettingRange: 0,
  hasFineDisplayDevice: false,
  instrumentType: InstrumentType.SingleRange,
  zeroSettingMechanisms: [],
};

const classIInstrument: Instrument = {
  ...standardInstrument,
  id: 'class1-001',
  accuracyClass: AccuracyClass.I,
  max: 0.2,
  min: 0.001,
  e: 0.0001,
  d: 0.0001,
  numberOfSupportPoints: 3,
};

const moreThan4PointsInstrument: Instrument = {
  ...standardInstrument,
  id: 'mt4-001',
  numberOfSupportPoints: 6,
};

const unsupportedTypeInstrument: Instrument = {
  ...standardInstrument,
  id: 'unsupported-001',
  instrumentType: 'multi_interval' as InstrumentType,
};

const ctx = VerificationContext.InitialVerification;

const passingObs: TestObservations = {
  weighingPerformance: [
    { sequenceIndex: 0, load: 100, indicatedValue: 100, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
    { sequenceIndex: 1, load: 2500, indicatedValue: 2500, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
    { sequenceIndex: 2, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
    { sequenceIndex: 3, load: 10000, indicatedValue: 10000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
    { sequenceIndex: 4, load: 15000, indicatedValue: 15000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
    { sequenceIndex: 5, load: 10000, indicatedValue: 10000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
    { sequenceIndex: 6, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
    { sequenceIndex: 7, load: 2500, indicatedValue: 2500, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
    { sequenceIndex: 8, load: 100, indicatedValue: 100, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
  ],
  repeatability: {
    testLoad: 12000,
    indications: [12000, 12002, 12001],
    autoZeroOrTrackingActive: true,
  },
  eccentricLoading: [
    { positionId: '1', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
    { positionId: '2', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
    { positionId: '3', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
    { positionId: '4', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
  ],
  eccentricZeroDeterminedBeforeEachLoading: false,
};

// 1. Test-selection for different instrument configurations

describe('selectTests - different instrument configurations', () => {
  it('selects all 3 original tests as applicable plus discrimination as non-applicable for a standard Class III 4-point instrument in Initial Verification', () => {
    const results = selectTests(standardInstrument, ctx);
    expect(results).toHaveLength(5);
    const types = results.filter(r => r.isApplicable).map(r => r.testType).sort();
    expect(types).toEqual([TestType.WeighingPerformance, TestType.Repeatability, TestType.EccentricLoading].sort());
    const disc = results.find(r => r.testType === TestType.Discrimination);
    expect(disc?.isApplicable).toBe(false);
  });

  it('selects all 3 original tests as applicable for a Class I 3-point instrument', () => {
    const results = selectTests(classIInstrument, ctx);
    expect(results).toHaveLength(5);
    expect(results.filter(r => r.isApplicable)).toHaveLength(3);
  });

  it('accuracy class does not gate WeighingPerformance or Repeatability applicability', () => {
    for (const cls of [AccuracyClass.I, AccuracyClass.II, AccuracyClass.III, AccuracyClass.IIII]) {
      const inst = { ...standardInstrument, accuracyClass: cls };
      const results = selectTests(inst, ctx);
      const weighing = results.find(r => r.testType === TestType.WeighingPerformance);
      const rep = results.find(r => r.testType === TestType.Repeatability);
      expect(weighing?.isApplicable).toBe(true);
      expect(rep?.isApplicable).toBe(true);
    }
  });

  it('returns exactly 5 entries regardless of instrument configuration', () => {
    expect(selectTests(standardInstrument, ctx)).toHaveLength(5);
    expect(selectTests(moreThan4PointsInstrument, ctx)).toHaveLength(5);
    expect(selectTests(unsupportedTypeInstrument, ctx)).toHaveLength(5);
  });
});

// 2. Non-applicable tests are excluded

describe('selectTests - non-applicable tests excluded', () => {
  it('marks EccentricLoading NOT applicable for > 4 support points, others still applicable', () => {
    const results = selectTests(moreThan4PointsInstrument, ctx);
    const eccentric = results.find(r => r.testType === TestType.EccentricLoading);
    expect(eccentric?.isApplicable).toBe(false);
    expect(eccentric?.reason).toMatch(/Unsupported/);
    expect(eccentric?.r76Reference).toContain('A.4.7.2');

    const weighing = results.find(r => r.testType === TestType.WeighingPerformance);
    const rep = results.find(r => r.testType === TestType.Repeatability);
    expect(weighing?.isApplicable).toBe(true);
    expect(rep?.isApplicable).toBe(true);
  });

  it('marks ALL tests NOT applicable for a non-single-range instrument type', () => {
    const results = selectTests(unsupportedTypeInstrument, ctx);
    expect(results).toHaveLength(5);
    expect(results.every(r => !r.isApplicable)).toBe(true);
    expect(results.find(r => r.testType === TestType.WeighingPerformance)?.reason.includes('Only single-range instruments are currently supported')).toBe(true);
  });

  it('only EccentricLoading, Discrimination, and ZeroSettingAccuracy are not-applicable for a 5-point instrument; other 2 applicable', () => {
    const fivePoint = { ...standardInstrument, numberOfSupportPoints: 5 };
    const results = selectTests(fivePoint, ctx);
    const applicable = results.filter(r => r.isApplicable);
    const notApplicable = results.filter(r => !r.isApplicable);
    expect(applicable).toHaveLength(2);
    expect(notApplicable).toHaveLength(3);
    expect(notApplicable.find(r => r.testType === TestType.EccentricLoading)).toBeDefined();
    expect(notApplicable.find(r => r.testType === TestType.Discrimination)).toBeDefined();
    expect(notApplicable.find(r => r.testType === TestType.ZeroSettingAccuracy)).toBeDefined();
  });
});

// 3. Evaluation using the selection result

describe('evaluateInstrumentCompliance - driven by test selection', () => {
  it('marks EccentricLoading as manual_review for > 4 support points; overall ManualReview', () => {
    const obs: TestObservations = {
      weighingPerformance: passingObs.weighingPerformance,
      repeatability: passingObs.repeatability,
      eccentricLoading: passingObs.eccentricLoading,
    };
    const res = evaluateInstrumentCompliance(moreThan4PointsInstrument, ctx, obs);

    const eccentricResult = res.evaluatedTests.find(t => t.testType === TestType.EccentricLoading);
    expect(eccentricResult?.status).toBe('manual_review');
    expect(eccentricResult?.selection.isApplicable).toBe(false);
    expect(res.overallOutcome).toBe(OverallOutcome.ManualReview);
    expect(res.counts.manualReview).toBe(1);
    expect(res.counts.passed).toBe(2);
    expect(res.counts.skipped).toBe(2); // Discrimination and ZeroSettingAccuracy
  });

  it('marks ALL tests as manual_review for unsupported instrument type', () => {
    const res = evaluateInstrumentCompliance(unsupportedTypeInstrument, ctx, passingObs);
    expect(res.counts.manualReview).toBe(5);
    expect(res.overallOutcome).toBe(OverallOutcome.ManualReview);
  });

  it('attaches selection with isApplicable=true on every evaluated passing test', () => {
    const res = evaluateInstrumentCompliance(standardInstrument, ctx, passingObs);
    for (const evaluated of res.evaluatedTests) {
      if (evaluated.status === 'passed') {
        expect(evaluated.selection.isApplicable).toBe(true);
      }
    }
  });

  it('includes prerequisites in the selection result for auto-zero instruments (eccentric and repeatability)', () => {
    const autoZeroInst: Instrument = {
      ...standardInstrument,
      hasAutoZeroOrTracking: true,
      zeroSettingMechanisms: ['automatic' as any],
    };
    const res = evaluateInstrumentCompliance(autoZeroInst, ctx, passingObs);

    const eccentricSel = res.testSelectionResults.find(s => s.testType === TestType.EccentricLoading);
    expect(eccentricSel?.prerequisites.some(p => p.includes('must NOT be in operation'))).toBe(true);

    const repeatSel = res.testSelectionResults.find(s => s.testType === TestType.Repeatability);
    expect(repeatSel?.prerequisites.some(p => p.includes('zero-setting or zero-tracking shall be in operation'))).toBe(true);
  });

  it('flags contradictory configuration for manual review when auto-zero is enabled but zeroSettingMechanisms is empty', () => {
    const contradictoryInst: Instrument = {
      ...standardInstrument,
      hasAutoZeroOrTracking: true,
      zeroSettingMechanisms: [],
    };
    const res = evaluateInstrumentCompliance(contradictoryInst, ctx, passingObs);
    const zeroRes = res.evaluatedTests.find(t => t.testType === TestType.ZeroSettingAccuracy);
    expect(zeroRes?.status).toBe('manual_review');
    expect(res.overallOutcome).toBe(OverallOutcome.ManualReview);
  });
});

// 4. Existing supported behaviour - regression

describe('existing supported behaviour - regression', () => {
  it('3-test standard instrument: all 3 pass -> overall Pass', () => {
    const res = evaluateInstrumentCompliance(standardInstrument, ctx, passingObs);
    expect(res.overallOutcome).toBe(OverallOutcome.Pass);
    expect(res.counts.passed).toBe(3);
    expect(res.counts.failed).toBe(0);
    expect(res.counts.manualReview).toBe(0);
  });

  it('testSelectionResults is included in OrchestrationResult and has 5 entries', () => {
    const res = evaluateInstrumentCompliance(standardInstrument, ctx, passingObs);
    expect(Array.isArray(res.testSelectionResults)).toBe(true);
    expect(res.testSelectionResults).toHaveLength(5);
  });

  it('verification context does not change test applicability', () => {
    const resInitial = evaluateInstrumentCompliance(
      standardInstrument,
      VerificationContext.InitialVerification,
      passingObs
    );
    const resSubsequent = evaluateInstrumentCompliance(
      standardInstrument,
      VerificationContext.SubsequentVerification,
      passingObs
    );
    const initialApplicability = resInitial.testSelectionResults.map(s => ({ t: s.testType, a: s.isApplicable }));
    const subsequentApplicability = resSubsequent.testSelectionResults.map(s => ({ t: s.testType, a: s.isApplicable }));
    expect(initialApplicability).toEqual(subsequentApplicability);
  });

  it('supplementary weighing prerequisite appears when initial zero-setting range > 20% Max', () => {
    const specialInst = {
      ...standardInstrument,
      hasInitialZeroSettingDevice: true,
      initialZeroSettingRange: 0.25,
    };
    const results = selectTests(specialInst, ctx);
    const weighing = results.find(r => r.testType === TestType.WeighingPerformance);
    expect(weighing?.isApplicable).toBe(true);
    expect(weighing?.prerequisites.some(p => p.includes('Supplementary weighing test required'))).toBe(true);
  });

  it('output is deterministic for identical inputs', () => {
    const run1 = selectTests(standardInstrument, ctx);
    const run2 = selectTests(standardInstrument, ctx);
    expect(run1).toEqual(run2);
  });
});
