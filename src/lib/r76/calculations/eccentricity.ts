import { EccentricLoadingObservation } from '../types/observations';
import { TestComplianceResult, TestOutcome, ObservationComplianceResult } from '../types/results';
import type { ComplianceTrace } from '../types/results';
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
  /** Structured Compliance Trace for this eccentric loading position. */
  trace: ComplianceTrace;
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

  // ── Retest explanation for the trace ──────────────────────────────
  let retestNote: string | undefined;
  if (!isPass) {
    if (!zeroDeterminedBeforeEachLoading) {
      retestNote =
        'Error exceeds the permissible limit. Zero was NOT determined before each individual loading. ' +
        'Per Annex A.4.7, a repeat test with a new zero determination before each loading position is required before a final FAIL can be issued.';
    } else {
      retestNote =
        'Error exceeds the permissible limit. Zero WAS determined before each individual loading (retest condition satisfied). ' +
        'This is a final FAIL — no further retest is permitted.';
    }
  }

  // ── Build Compliance Trace ──────────────────────────────────────
  const trace: ComplianceTrace = {
    instrumentContext: {
      'Accuracy Class': instrument.accuracyClass,
      'Max (kg)': instrument.max,
      'Min (kg)': instrument.min,
      'e (kg)': e,
      'd (kg)': instrument.d,
      'Support points': instrument.numberOfSupportPoints,
      'Verification Context': mpeResult.mpeTrace.verificationContext,
      'Zero determined before each loading': zeroDeterminedBeforeEachLoading,
    },
    references: [
      {
        document: 'OIML R 76-1:2006 (E)',
        clause: '3.6.2',
        purpose: 'Eccentric loading — general requirement',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        clause: '3.6.2.1',
        purpose: 'Eccentric loading — test load rule: 1/3 × (Max + maximum additive tare effect), applied at each quarter segment',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        annex: 'Annex A.4.7',
        purpose: 'Eccentric loading test procedure; retest condition when zero is not determined before each loading',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        annex: 'Annex A.4.7.1',
        purpose: 'Eccentric loading procedure for load receptors with not more than four support points',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        clause: '3.5.1',
        table: 'Table 6',
        purpose: 'Maximum permissible errors on verification (MPE reference for eccentric loading)',
      },
    ],
    inputs: {
      'Position ID': positionId,
      'L — Applied load (kg)': L,
      'I — Indicated value (kg)': I,
      'ΔL — Additional load (kg)': deltaL,
      'E0 — Zero error (kg)': E0,
      'e — Verification scale interval (kg)': e,
      ...(retestNote ? { 'Retest note': retestNote } : {}),
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
          annex: 'Annex A.4.7.1',
          purpose: 'Error formula with rounding correction for eccentric position',
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
    explanation: `Position ${positionId}: L=${L}, I=${I}, ΔL=${deltaL}, E0=${E0} -> P=${P}, E=${E}, Ec=${Ec}. MPE is ±${mpe}. |Ec| ${isPass ? '≤' : '>'} MPE ➔ ${outcome.toUpperCase()}.`,
    trace,
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
