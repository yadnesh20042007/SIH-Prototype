import { WeighingPerformanceObservation } from '../types/observations';
import { ObservationComplianceResult, TestComplianceResult, TestOutcome } from '../types/results';
import type { ComplianceTrace } from '../types/results';
import { calculateMPE } from './mpe';
import { Instrument } from '../types/instrument';
import { VerificationContext } from '../types/verification';

export interface WeighingPerformanceObservationResult extends ObservationComplianceResult {
  indicationPriorToRounding: number;
  errorPriorToRounding: number;
  /** Structured Compliance Trace for this observation. */
  trace: ComplianceTrace;
}

export interface WeighingPerformanceTestResult extends TestComplianceResult {
  observationResults: WeighingPerformanceObservationResult[];
  /** Compliance traces for each observation, in sequence order. */
  traces: ComplianceTrace[];
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

  // ── Build Compliance Trace ──────────────────────────────────────
  const trace: ComplianceTrace = {
    instrumentContext: {
      'Accuracy Class': instrument.accuracyClass,
      'Max (kg)': instrument.max,
      'Min (kg)': instrument.min,
      'e (kg)': e,
      'd (kg)': instrument.d,
      'Verification Context': mpeResult.mpeTrace.verificationContext,
    },
    references: [
      {
        document: 'OIML R 76-1:2006 (E)',
        clause: '3.5.1',
        table: 'Table 6',
        purpose: 'Maximum permissible errors on verification',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        annex: 'Annex A.4.4.1',
        purpose: 'Weighing test — general procedure',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        annex: 'Annex A.4.4.3',
        purpose: 'Error calculation with rounding correction (digital indication)',
      },
    ],
    inputs: {
      'L — Applied load (kg)': L,
      'I — Indicated value (kg)': I,
      'ΔL — Additional load (kg)': deltaL,
      'E0 — Zero error (kg)': E0,
      'e — Verification scale interval (kg)': e,
      'Loading direction': obs.loadingDirection,
    },
    calculationSteps: [
      {
        label: 'Indication before rounding (P)',
        formula: 'P = I + 0.5e − ΔL',
        substitutedFormula: `P = ${I} + 0.5(${e}) − ${deltaL}`,
        result: P,
        unit: 'kg',
        reference: {
          document: 'OIML R 76-1:2006 (E)',
          annex: 'Annex A.4.4.3',
          purpose: 'Rounding correction applied to digital indication',
        },
      },
      {
        label: 'Error before zero correction (E)',
        formula: 'E = P − L',
        substitutedFormula: `E = ${P} − ${L}`,
        result: E,
        unit: 'kg',
      },
      {
        label: 'Corrected indication error (Ec)',
        formula: 'Ec = E − E0',
        substitutedFormula: `Ec = ${E} − ${E0}`,
        result: Ec,
        unit: 'kg',
      },
    ],
    mpeTrace: mpeResult.mpeTrace,
    comparison: {
      formula: '|Ec| ≤ MPE',
      substituted: `|${Ec} kg| ≤ ${mpe} kg`,
      passed: isPass,
    },
    outcome,
  };

  return {
    indicationPriorToRounding: P,
    errorPriorToRounding: E,
    calculatedError: Ec,
    mpe: mpe,
    outcome,
    r76Reference: 'R76-1 (2006) clause 3.6, A.4.4.3',
    explanation: `L=${L}, I=${I}, ΔL=${deltaL}, E0=${E0} -> P=${P}, E=${E}, Ec=${Ec}. MPE is ±${mpe}. |Ec| ${isPass ? '≤' : '>'} MPE ➔ ${outcome.toUpperCase()}.`,
    trace,
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
    traces: observationResults.map(r => r.trace),
    r76Reference: 'R76-1 (2006) clause 3.6',
    explanation: `Weighing performance test ${allPass ? 'PASSED' : 'FAILED'} with max absolute error ${maxAbsoluteError}.`
  };
}
