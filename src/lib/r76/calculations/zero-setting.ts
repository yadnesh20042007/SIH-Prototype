import { ZeroSettingObservation } from '../types/observations';
import { TestComplianceResult, TestOutcome, ObservationComplianceResult } from '../types/results';
import type { ComplianceTrace } from '../types/results';
import { Instrument } from '../types/instrument';
import { VerificationContext } from '../types/verification';

export interface ZeroSettingObservationResult extends ObservationComplianceResult {
  trace: ComplianceTrace;
}

export interface ZeroSettingAccuracyTestResult extends TestComplianceResult {
  observationResults: ZeroSettingObservationResult[];
  traces: ComplianceTrace[];
}

/**
 * Fixes typical JavaScript floating point inaccuracies for display and comparison.
 */
function fixFloat(val: number): number {
  return Math.round(val * 1e8) / 1e8;
}

export function evaluateZeroSettingObservation(
  obs: ZeroSettingObservation,
  instrument: Instrument,
  context: VerificationContext
): ZeroSettingObservationResult {
  const L = obs.load;
  const I = obs.indicatedValue;
  if (obs.additionalLoad === undefined || obs.additionalLoad === null || typeof obs.additionalLoad !== 'number' || !Number.isFinite(obs.additionalLoad)) {
    throw new Error('additionalLoad (ΔL) is required for error calculation but was not provided. Cannot silently assume zero.');
  }
  const dL = obs.additionalLoad;
  const e = instrument.e;

  // R76-1 A.4.1: Error E = I + 0.5e - ΔL - L
  const rawE0 = I + 0.5 * e - dL - L;
  const E0 = fixFloat(rawE0);

  // Acceptance limit: abs(E0) <= 0.25e (R76-1 §4.5.2)
  const limit = fixFloat(0.25 * e);
  const isPass = Math.abs(E0) <= limit;
  const outcome = isPass ? TestOutcome.Pass : TestOutcome.Fail;

  const trace: ComplianceTrace = {
    instrumentContext: {
      'Accuracy Class': instrument.accuracyClass,
      'Max (kg)': instrument.max,
      'Min (kg)': instrument.min,
      'e (kg)': instrument.e,
      'd (kg)': instrument.d,
      'Verification Context': context,
    },
    references: [
      {
        document: 'OIML R 76-1:2006 (E)',
        clause: '4.5.2',
        purpose: 'Zero-setting accuracy limit (±0.25e)',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        annex: 'Annex A.4.2.3',
        purpose: 'Zero-setting accuracy test procedure',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        annex: 'Annex A.4.1',
        purpose: 'Error determination method (E = I + 0.5e - ΔL - L)',
      }
    ],
    inputs: {
      'L — Reference load (kg)': L,
      'I — Indicated value (kg)': I,
      'ΔL — Additional load (kg)': dL,
      'e — Verification scale interval (kg)': e,
    },
    calculationSteps: [
      {
        label: 'Zero deviation calculation (E0)',
        formula: 'E0 = I + 0.5e - ΔL - L',
        substitutedFormula: `E0 = ${I} + ${0.5 * e} - ${dL} - ${L}`,
        result: E0,
        unit: 'kg',
      }
    ],
    mpeTrace: {
      accuracyClass: instrument.accuracyClass,
      load: 0,
      e: instrument.e,
      loadOverE: 0,
      tableBand: 'Zero-setting (±0.25e)',
      mpeFactor: '0.25',
      baseMPE: limit,
      verificationContext: context,
      contextMultiplier: 1, // Fixed limit
      effectiveMPE: limit,
      reference: {
        document: 'OIML R 76-1:2006 (E)',
        clause: '4.5.2',
        purpose: 'Zero deviation shall not exceed ±0.25e'
      }
    },
    comparison: {
      formula: 'abs(E0) <= 0.25e',
      substituted: `abs(${E0}) <= ${limit}`,
      passed: isPass,
    },
    outcome,
  };

  return {
    calculatedError: E0,
    mpe: limit,
    outcome,
    r76Reference: 'R76-1 (2006) clause 4.5.2, A.4.2.3',
    explanation: `Calculated E0=${E0} kg. Limit is ±${limit} kg. ${isPass ? 'PASSED' : 'FAILED'}.`,
    trace,
  };
}

/**
 * Evaluates the zero-setting accuracy test per R76-1 (2006) A.4.2.3.
 */
export function evaluateZeroSettingTest(
  observation: ZeroSettingObservation,
  instrument: Instrument,
  context: VerificationContext
): ZeroSettingAccuracyTestResult {
  if (!observation) {
    throw new Error('Observation is required for zero-setting accuracy test.');
  }

  const observationResults = [evaluateZeroSettingObservation(observation, instrument, context)];
  const observationResult = observationResults[0];

  return {
    outcome: observationResult.outcome,
    maxAbsoluteError: Math.abs(observationResult.calculatedError),
    observationResults,
    traces: [observationResult.trace],
    r76Reference: 'R76-1 (2006) clause 4.5.2, A.4.2.3',
    explanation: `Zero-setting accuracy test ${observationResult.outcome === TestOutcome.Pass ? 'PASSED' : 'FAILED'} with E0=${observationResult.calculatedError} kg.`
  };
}
