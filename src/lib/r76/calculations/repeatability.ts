import { RepeatabilityObservation } from '../types/observations';
import { TestComplianceResult, TestOutcome } from '../types/results';
import type { ComplianceTrace } from '../types/results';
import { calculateMPE } from './mpe';
import { Instrument, AccuracyClass } from '../types/instrument';
import { VerificationContext } from '../types/verification';

export interface RepeatabilityTestResult extends TestComplianceResult {
  testLoad: number;
  numberOfWeighings: number;
  iMax: number;
  iMin: number;
  mpe: number;
  /** Structured Compliance Trace for the repeatability test. */
  trace: ComplianceTrace;
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

  // ── Build Compliance Trace ──────────────────────────────────────
  const indicationsList = obs.indications.map((v, i) => `I${i + 1} = ${v} kg`).join(', ');

  const trace: ComplianceTrace = {
    instrumentContext: {
      'Accuracy Class': instrument.accuracyClass,
      'Max (kg)': instrument.max,
      'Min (kg)': instrument.min,
      'e (kg)': instrument.e,
      'd (kg)': instrument.d,
      'Verification Context': mpeResult.mpeTrace.verificationContext,
      'Required weighings': requiredWeighings,
      'Auto-zero / tracking active': obs.autoZeroOrTrackingActive,
    },
    references: [
      {
        document: 'OIML R 76-1:2006 (E)',
        clause: '3.6.1',
        purpose: 'Repeatability — maximum permissible variation of indication',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        annex: 'Annex A.4.10',
        purpose: 'Repeatability test procedure (3rd paragraph: R ≤ MPE criterion)',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        clause: '3.5.1',
        table: 'Table 6',
        purpose: 'Maximum permissible errors on verification (MPE reference for repeatability)',
      },
    ],
    inputs: {
      'Test load L (kg)': obs.testLoad,
      'Number of weighings': obs.indications.length,
      'Indications': indicationsList,
      'Imax (kg)': iMax,
      'Imin (kg)': iMin,
    },
    calculationSteps: [
      {
        label: 'Maximum indication (Imax)',
        formula: 'Imax = max(I1, I2, …, In)',
        substitutedFormula: `Imax = max(${obs.indications.join(', ')})`,
        result: iMax,
        unit: 'kg',
      },
      {
        label: 'Minimum indication (Imin)',
        formula: 'Imin = min(I1, I2, …, In)',
        substitutedFormula: `Imin = min(${obs.indications.join(', ')})`,
        result: iMin,
        unit: 'kg',
      },
      {
        label: 'Repeatability range (R)',
        formula: 'R = Imax − Imin',
        substitutedFormula: `R = ${iMax} − ${iMin}`,
        result: R,
        unit: 'kg',
        reference: {
          document: 'OIML R 76-1:2006 (E)',
          annex: 'Annex A.4.10',
          purpose: 'Repeatability spread calculation',
        },
      },
    ],
    mpeTrace: mpeResult.mpeTrace,
    comparison: {
      formula: 'R ≤ MPE',
      substituted: `${R} kg ≤ ${mpe} kg`,
      passed: isPass,
    },
    outcome,
  };

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
    trace,

    r76Reference: 'R76-1 (2006) clause 3.6.1, A.4.10 (3rd paragraph)',
    explanation: `Test load: ${obs.testLoad} kg, Weighings: ${obs.indications.length}. Imax = ${iMax}, Imin = ${iMin}. R = ${R}. MPE is ±${mpe}. R ${isPass ? '≤' : '>'} MPE ➔ ${outcome.toUpperCase()}.`
  };
}
