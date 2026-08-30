import { WeighingPerformanceObservation } from '../types/observations';
import { ObservationComplianceResult, TestComplianceResult, TestOutcome } from '../types/results';
import { calculateMPE } from './mpe';
import { Instrument } from '../types/instrument';
import { VerificationContext } from '../types/verification';

export interface WeighingPerformanceObservationResult extends ObservationComplianceResult {
  indicationPriorToRounding: number;
  errorPriorToRounding: number;
}

export interface WeighingPerformanceTestResult extends TestComplianceResult {
  observationResults: WeighingPerformanceObservationResult[];
}

/**
 * Fixes typical JavaScript floating point inaccuracies for display and comparison.
 */
function fixFloat(val: number): number {
  return Math.round(val * 1e8) / 1e8;
}

/**
 * Evaluates a single weighing performance observation according to R76-1 (2006) A.4.4.3.
 */
export function evaluateWeighingObservation(
  obs: WeighingPerformanceObservation,
  instrument: Instrument,
  context: VerificationContext
): WeighingPerformanceObservationResult {
  if (obs.additionalLoad === undefined) {
    throw new Error('additionalLoad (ΔL) is required for error calculation but was not provided. Cannot silently assume zero.');
  }

  const L = obs.load;
  const I = obs.indicatedValue;
  const deltaL = obs.additionalLoad;
  const E0 = obs.zeroError;
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
  
  // PASS ⇔ |Ec| ≤ effective MPE (with tiny tolerance for float math)
  const isPass = (Math.abs(Ec) - mpe) <= 1e-9;
  const outcome = isPass ? TestOutcome.Pass : TestOutcome.Fail;
  
  return {
    indicationPriorToRounding: P,
    errorPriorToRounding: E,
    calculatedError: Ec,
    mpe: mpe,
    outcome,
    r76Reference: 'R76-1 (2006) clause 3.6, A.4.4.3',
    explanation: `L=${L}, I=${I}, ΔL=${deltaL}, E0=${E0} -> P=${P}, E=${E}, Ec=${Ec}. MPE is ±${mpe}. |Ec| ${isPass ? '≤' : '>'} MPE ➔ ${outcome.toUpperCase()}.`
  };
}

/**
 * Evaluates an entire weighing performance test run by aggregating observation results.
 * A single failure results in the entire test failing.
 */
export function evaluateWeighingPerformanceTest(
  observations: WeighingPerformanceObservation[],
  instrument: Instrument,
  context: VerificationContext
): WeighingPerformanceTestResult {
  if (observations.length === 0) {
    throw new Error('No observations provided for weighing performance test.');
  }

  const observationResults = observations.map(obs => evaluateWeighingObservation(obs, instrument, context));
  
  const allPass = observationResults.every(r => r.outcome === TestOutcome.Pass);
  const outcome = allPass ? TestOutcome.Pass : TestOutcome.Fail;
  
  let maxAbsoluteError = 0;
  for (const r of observationResults) {
    const absError = Math.abs(r.calculatedError);
    if (absError > maxAbsoluteError) {
      maxAbsoluteError = absError;
    }
  }

  return {
    outcome,
    maxAbsoluteError,
    observationResults,
    r76Reference: 'R76-1 (2006) clause 3.6',
    explanation: `Weighing performance test ${allPass ? 'PASSED' : 'FAILED'} with max absolute error ${maxAbsoluteError}.`
  };
}
