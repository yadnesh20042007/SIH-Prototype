import { RepeatabilityObservation } from '../types/observations';
import { TestComplianceResult, TestOutcome } from '../types/results';
import { calculateMPE } from './mpe';
import { Instrument, AccuracyClass } from '../types/instrument';
import { VerificationContext } from '../types/verification';

export interface RepeatabilityTestResult extends TestComplianceResult {
  testLoad: number;
  numberOfWeighings: number;
  iMax: number;
  iMin: number;
  mpe: number;
}

/**
 * Fixes typical JavaScript floating point inaccuracies for display and comparison.
 */
function fixFloat(val: number): number {
  return Math.round(val * 1e8) / 1e8;
}

/**
 * Evaluates a repeatability test observation according to R76-1 (2006) A.4.10 / 3.6.1.
 */
export function evaluateRepeatabilityTest(
  obs: RepeatabilityObservation,
  instrument: Instrument,
  context: VerificationContext
): RepeatabilityTestResult {
  // 1. Enforce zero-tracking requirement (A.4.10)
  if (instrument.hasAutoZeroOrTracking && !obs.autoZeroOrTrackingActive) {
    throw new Error('Automatic zero-setting/zero-tracking must be active during the repeatability test.');
  }

  // 2. Enforce required number of weighings
  let requiredWeighings = 3;
  if (instrument.accuracyClass === AccuracyClass.I || instrument.accuracyClass === AccuracyClass.II) {
    requiredWeighings = 6;
  }

  if (obs.indications.length !== requiredWeighings) {
    throw new Error(
      `Accuracy Class ${instrument.accuracyClass} requires exactly ${requiredWeighings} weighings for repeatability. Provided ${obs.indications.length}.`
    );
  }

  // 3. Calculate spread (R = Imax - Imin)
  const iMax = Math.max(...obs.indications);
  const iMin = Math.min(...obs.indications);
  const R = fixFloat(iMax - iMin);

  // 4. Determine MPE for the test load
  const mpeResult = calculateMPE(instrument.accuracyClass, obs.testLoad, instrument.e, context);
  const mpe = mpeResult.effectiveMPE;

  // 5. Determine PASS/FAIL (R <= effective MPE)
  // Using a tiny tolerance for floating point comparisons
  const isPass = (R - mpe) <= 1e-9;
  const outcome = isPass ? TestOutcome.Pass : TestOutcome.Fail;

  return {
    outcome,
    maxAbsoluteError: R, // In repeatability, the primary "error" is the spread R
    observationResults: [], // No individual Ec checks per observation strictly required for the core test spread
    repeatabilityRange: R,
    
    testLoad: obs.testLoad,
    numberOfWeighings: obs.indications.length,
    iMax,
    iMin,
    mpe,

    r76Reference: 'R76-1 (2006) clause 3.6.1, A.4.10 (3rd paragraph)',
    explanation: `Test load: ${obs.testLoad} kg, Weighings: ${obs.indications.length}. Imax = ${iMax}, Imin = ${iMin}. R = ${R}. MPE is ±${mpe}. R ${isPass ? '≤' : '>'} MPE ➔ ${outcome.toUpperCase()}.`
  };
}
