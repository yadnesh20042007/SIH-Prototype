import { EccentricLoadingObservation } from '../types/observations';
import { TestComplianceResult, TestOutcome, ObservationComplianceResult } from '../types/results';
import { calculateMPE } from './mpe';
import { Instrument } from '../types/instrument';
import { VerificationContext } from '../types/verification';

export interface EccentricityPositionResult extends ObservationComplianceResult {
  positionId: string;
  appliedLoad: number;
  indicatedValue: number;
  indicationPriorToRounding: number;
  errorPriorToRounding: number;
  zeroError: number;
}

export interface EccentricityTestResult extends TestComplianceResult {
  observationResults: EccentricityPositionResult[];
  retestRequired: boolean;
}

/**
 * Fixes typical JavaScript floating point inaccuracies for display and comparison.
 */
function fixFloat(val: number): number {
  return Math.round(val * 1e8) / 1e8;
}

/**
 * Evaluates a single eccentric loading position observation.
 */
export function evaluateEccentricPosition(
  obs: EccentricLoadingObservation,
  instrument: Instrument,
  context: VerificationContext,
  zeroDeterminedBeforeEachLoading: boolean
): EccentricityPositionResult {
  if (instrument.numberOfSupportPoints > 4) {
    throw new Error('This prototype supports only standard platforms with 4 or fewer support points.');
  }

  if (instrument.hasAutoZeroOrTracking && !obs.autoZeroOrTrackingDisabled) {
    throw new Error('Automatic zero-setting/zero-tracking must be disabled during the eccentric loading test.');
  }

  if (obs.additionalLoad === undefined) {
    throw new Error('additionalLoad (ΔL) is required for error calculation but was not provided. Cannot silently assume zero.');
  }

  const { appliedLoad: L, indicatedValue: I, additionalLoad: deltaL, zeroError: E0, positionId } = obs;
  const e = instrument.e;

  // P = I + 0.5e - ΔL
  const P = fixFloat(I + 0.5 * e - deltaL);
  
  // E = P - L
  const E = fixFloat(P - L);
  
  // Ec = E - E0
  const Ec = fixFloat(E - E0);
  
  // MPE
  const mpeResult = calculateMPE(instrument.accuracyClass, L, e, context);
  const mpe = mpeResult.effectiveMPE;
  
  // PASS ⇔ |Ec| ≤ effective MPE
  const isPass = (Math.abs(Ec) - mpe) <= 1e-9;
  
  let outcome = TestOutcome.Pass;
  if (!isPass) {
    if (!zeroDeterminedBeforeEachLoading) {
      outcome = TestOutcome.RequiresRetest;
    } else {
      outcome = TestOutcome.Fail;
    }
  }

  return {
    positionId,
    appliedLoad: L,
    indicatedValue: I,
    indicationPriorToRounding: P,
    errorPriorToRounding: E,
    zeroError: E0,
    calculatedError: Ec,
    mpe,
    outcome,
    r76Reference: 'R76-1 (2006) 3.6.2.1, A.4.7',
    explanation: `Position ${positionId}: L=${L}, I=${I}, ΔL=${deltaL}, E0=${E0} -> P=${P}, E=${E}, Ec=${Ec}. MPE is ±${mpe}. |Ec| ${isPass ? '≤' : '>'} MPE ➔ ${outcome.toUpperCase()}.`
  };
}

/**
 * Evaluates an entire eccentric loading test across all supported positions.
 */
export function evaluateEccentricLoadingTest(
  observations: EccentricLoadingObservation[],
  instrument: Instrument,
  context: VerificationContext,
  zeroDeterminedBeforeEachLoading: boolean = false
): EccentricityTestResult {
  if (observations.length === 0) {
    throw new Error('No observations provided for eccentric loading test.');
  }

  const observationResults = observations.map(obs => 
    evaluateEccentricPosition(obs, instrument, context, zeroDeterminedBeforeEachLoading)
  );

  let overallOutcome = TestOutcome.Pass;
  let retestRequired = false;
  let maxAbsoluteError = 0;

  for (const r of observationResults) {
    const absError = Math.abs(r.calculatedError);
    if (absError > maxAbsoluteError) {
      maxAbsoluteError = absError;
    }

    if (r.outcome === TestOutcome.RequiresRetest) {
      retestRequired = true;
      if (overallOutcome !== TestOutcome.Fail) {
        overallOutcome = TestOutcome.RequiresRetest;
      }
    } else if (r.outcome === TestOutcome.Fail) {
      overallOutcome = TestOutcome.Fail;
    }
  }

  return {
    outcome: overallOutcome,
    maxAbsoluteError,
    observationResults,
    retestRequired,
    r76Reference: 'R76-1 (2006) clause 3.6.2, A.4.7',
    explanation: `Eccentric loading test overall outcome: ${overallOutcome.toUpperCase()}. Max absolute error: ${maxAbsoluteError} kg.`
  };
}
