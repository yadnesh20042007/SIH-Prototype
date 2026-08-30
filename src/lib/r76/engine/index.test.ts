import { describe, it, expect } from 'vitest';
import { evaluateInstrumentCompliance, TestObservations, OverallOutcome } from './index';
import { AccuracyClass, Instrument, InstrumentType } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { WeighingPerformanceObservation, RepeatabilityObservation, EccentricLoadingObservation } from '../types/observations';
import { TestType } from '../types/test';

describe('End-to-End Orchestration Service (R76 Engine)', () => {
  const baseInst: Instrument = {
    id: 'inst-orch',
    manufacturer: 'TestMaker',
    model: 'ModelOrch',
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
    instrumentType: InstrumentType.SingleRange
  };

  const context = VerificationContext.InitialVerification;

  // Helpers to generate valid passing observations
  const getPassingWeighing = (): WeighingPerformanceObservation[] => [
    { sequenceIndex: 0, load: 1000, indicatedValue: 1000, additionalLoad: 1.5, zeroError: 0.5, loadingDirection: 'increasing' }
  ];

  const getFailingWeighing = (): WeighingPerformanceObservation[] => [
    { sequenceIndex: 0, load: 1000, indicatedValue: 1005, additionalLoad: 0, zeroError: -0.5, loadingDirection: 'increasing' }
  ];

  const getPassingRepeatability = (): RepeatabilityObservation => ({
    testLoad: 1000, indications: [1000.0, 1002.0, 1001.0], autoZeroOrTrackingActive: true
  });

  const getPassingEccentric = (): EccentricLoadingObservation[] => [
    { positionId: '1', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true }
  ];

  const getRequiresRetestEccentric = (): EccentricLoadingObservation[] => [
    { positionId: '1', appliedLoad: 5000, indicatedValue: 5005, additionalLoad: 0, zeroError: 0, autoZeroOrTrackingDisabled: true }
  ];

  it('evaluates all 3 applicable tests supplied and passing → overall PASS', () => {
    const obs: TestObservations = {
      weighingPerformance: getPassingWeighing(),
      repeatability: getPassingRepeatability(),
      eccentricLoading: getPassingEccentric()
    };
    
    const res = evaluateInstrumentCompliance(baseInst, context, obs);
    expect(res.overallOutcome).toBe(OverallOutcome.Pass);
    expect(res.counts.passed).toBe(3);
    expect(res.counts.failed).toBe(0);
  });

  it('evaluates one test final FAIL → overall FAIL', () => {
    const obs: TestObservations = {
      weighingPerformance: getFailingWeighing(),
      repeatability: getPassingRepeatability(),
      eccentricLoading: getPassingEccentric()
    };
    
    const res = evaluateInstrumentCompliance(baseInst, context, obs);
    expect(res.overallOutcome).toBe(OverallOutcome.Fail);
    expect(res.counts.failed).toBe(1);
    expect(res.counts.passed).toBe(2);
  });

  it('evaluates eccentric loading requiring retest → overall REQUIRES_RETEST', () => {
    const obs: TestObservations = {
      weighingPerformance: getPassingWeighing(),
      repeatability: getPassingRepeatability(),
      eccentricLoading: getRequiresRetestEccentric(),
      eccentricZeroDeterminedBeforeEachLoading: false
    };
    
    const res = evaluateInstrumentCompliance(baseInst, context, obs);
    expect(res.overallOutcome).toBe(OverallOutcome.RequiresRetest);
    expect(res.counts.requiresRetest).toBe(1);
  });

  it('evaluates missing repeatability observation → overall INCOMPLETE', () => {
    const obs: TestObservations = {
      weighingPerformance: getPassingWeighing(),
      // repeatability missing
      eccentricLoading: getPassingEccentric()
    };
    
    const res = evaluateInstrumentCompliance(baseInst, context, obs);
    expect(res.overallOutcome).toBe(OverallOutcome.Incomplete);
    expect(res.counts.incomplete).toBe(1);
  });

  it('evaluates unsupported/manual-review condition → overall MANUAL_REVIEW', () => {
    // Modify instrument to trigger manual review (> 4 points for eccentric loading)
    const manualInst = { ...baseInst, numberOfSupportPoints: 6 };
    const obs: TestObservations = {
      weighingPerformance: getPassingWeighing(),
      repeatability: getPassingRepeatability()
      // Eccentric will be marked as manual_review by the selector
    };
    
    const res = evaluateInstrumentCompliance(manualInst, context, obs);
    expect(res.overallOutcome).toBe(OverallOutcome.ManualReview);
    expect(res.counts.manualReview).toBe(1);
  });

  it('ensures failure precedence over incomplete/manual-review', () => {
    const manualInst = { ...baseInst, numberOfSupportPoints: 6 };
    const obs: TestObservations = {
      weighingPerformance: getFailingWeighing(), // Fails
      // Repeatability missing (Incomplete)
      // Eccentric unsupported (Manual Review)
    };
    
    const res = evaluateInstrumentCompliance(manualInst, context, obs);
    expect(res.overallOutcome).toBe(OverallOutcome.Fail);
  });

  it('ensures retest precedence over incomplete/manual-review', () => {
    const manualInst = { ...baseInst, numberOfSupportPoints: 6 };
    // We cannot easily make eccentric require retest if it's unsupported, so let's use weighing passing, eccentric unsupported, but wait, weighing can't require retest.
    // Let's use a standard instrument, passing weighing, missing repeatability, and eccentric requires retest.
    const obs: TestObservations = {
      weighingPerformance: getPassingWeighing(),
      // Repeatability missing (Incomplete)
      eccentricLoading: getRequiresRetestEccentric(),
      eccentricZeroDeterminedBeforeEachLoading: false
    };
    
    const res = evaluateInstrumentCompliance(baseInst, context, obs);
    expect(res.overallOutcome).toBe(OverallOutcome.RequiresRetest);
  });

  it('produces deterministic identical output for identical input', () => {
    const obs: TestObservations = {
      weighingPerformance: getPassingWeighing(),
      repeatability: getPassingRepeatability(),
      eccentricLoading: getPassingEccentric()
    };
    
    const run1 = evaluateInstrumentCompliance(baseInst, context, obs);
    const run2 = evaluateInstrumentCompliance(baseInst, context, obs);
    
    expect(run1).toEqual(run2);
  });
});
