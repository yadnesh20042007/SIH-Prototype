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
  prescribedLoad: number;
  completeness: EccentricCompletenessResult;
}

/**
 * Fixes typical JavaScript floating point inaccuracies for display and comparison.
 */
export function fixFloat(val: number): number {
  return Math.round(val * 1e8) / 1e8;
}

export interface EccentricLoadValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates an applied eccentric test load against instrument Max capacity
 * and the prescribed test load per OIML R 76-1:2006 clause 3.6.2.1:
 * L_prescribed = 1/3 * (Max + maximum additive tare effect).
 *
 * Rules:
 * 1. Applied load cannot be negative or zero.
 * 2. Applied load must not exceed instrument Max capacity.
 * 3. Applied load must match the prescribed load within scale interval / weight tolerance (no arbitrary tolerance).
 */
export function validateEccentricLoad(
  load: number | undefined | null,
  instrument: { max?: number; e?: number; additiveTareEffect?: boolean }
): EccentricLoadValidationResult {
  if (load === undefined || load === null || typeof load !== 'number' || !Number.isFinite(load)) {
    return { isValid: false, error: 'Applied eccentric test load must be a valid finite number.' };
  }
  if (load <= 0) {
    return { isValid: false, error: 'Applied eccentric test load must be greater than zero.' };
  }
  if (instrument.max !== undefined && fixFloat(load) > fixFloat(instrument.max)) {
    return {
      isValid: false,
      error: `Applied eccentric load ${load} kg exceeds instrument Max capacity (${instrument.max} kg).`,
    };
  }
  if (instrument.max !== undefined) {
    const prescribedLoad = fixFloat(instrument.max / 3);
    const e = instrument.e ?? 0;
    // OIML R 76 does not permit arbitrary tolerances (e.g. +/-10%). Standard weight representation allows within verification scale interval e.
    const tolerance = Math.max(1e-6, e);
    if (Math.abs(fixFloat(load) - prescribedLoad) > tolerance) {
      return {
        isValid: false,
        error: `Applied eccentric load ${load} kg does not match prescribed test load ${prescribedLoad} kg (1/3 Max per OIML R 76-1 clause 3.6.2.1).`,
      };
    }
  }
  return { isValid: true };
}

/**
 * Validates a string or numeric eccentric load input against instrument Max and prescribed load.
 */
export function validateEccentricLoadInput(
  rawLoad: string | number | undefined | null,
  instrument?: { max?: number; e?: number; additiveTareEffect?: boolean }
): EccentricLoadValidationResult {
  if (rawLoad === undefined || rawLoad === null) {
    return { isValid: false, error: 'Eccentric test load is required.' };
  }
  if (typeof rawLoad === 'string') {
    const trimmed = rawLoad.trim();
    if (trimmed === '') {
      return { isValid: false, error: 'Eccentric test load is required.' };
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return { isValid: false, error: 'Eccentric test load must be a valid number.' };
    }
    return validateEccentricLoad(parsed, instrument ?? {});
  }
  return validateEccentricLoad(rawLoad, instrument ?? {});
}

/**
 * Calculates the prescribed eccentric test load according to OIML R 76-1:2006 clause 3.6.2.1:
 * L_prescribed = 1/3 * (Max + maximum additive tare effect).
 */
export function calculatePrescribedEccentricLoad(instrument: Instrument): number {
  return fixFloat(instrument.max / 3);
}

/**
 * Checks whether a single eccentric loading observation is structurally and metrologically valid.
 */
export function isEccentricObservationValid(
  obs: EccentricLoadingObservation,
  instrument: Instrument
): boolean {
  if (!obs) return false;
  if (!obs.positionId || String(obs.positionId).trim().length === 0) return false;
  const loadCheck = validateEccentricLoad(obs.appliedLoad, instrument);
  if (!loadCheck.isValid) return false;
  if (obs.indicatedValue === undefined || obs.indicatedValue === null || !Number.isFinite(obs.indicatedValue)) return false;
  if (obs.additionalLoad === undefined || obs.additionalLoad === null || !Number.isFinite(obs.additionalLoad)) return false;
  if (obs.zeroError === undefined || obs.zeroError === null || !Number.isFinite(obs.zeroError)) return false;
  return true;
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

  // Validate applied eccentric load against capacity and prescribed test load per OIML R 76-1 clause 3.6.2.1
  const loadCheck = validateEccentricLoad(obs.appliedLoad, instrument);
  if (!loadCheck.isValid) {
    throw new Error(`Eccentric loading test position ${obs.positionId} (applied load: ${obs.appliedLoad} kg): ${loadCheck.error}`);
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
  let mpeResult;
  try {
    mpeResult = calculateMPE(instrument.accuracyClass, L, e, context);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Eccentric loading test position ${obs.positionId} (applied load: ${L} kg): ${msg}`);
  }
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

export interface EccentricCompletenessResult {
  isComplete: boolean;
  prescribedLoad: number;
  requiredPositionsCount: number;
  testedPositionsCount: number;
  missingPositionsCount: number;
  testedPositions: string[];
  missingPositions: string[];
  clause: string;
  message?: string;
}

/**
 * Verifies whether all required eccentric loading positions have been tested
 * for the given instrument configuration per OIML R76-1 clause 3.6.2 and Annex A.4.7.
 */
export function checkEccentricCompleteness(
  observations: EccentricLoadingObservation[],
  instrument: Instrument
): EccentricCompletenessResult {
  const points = instrument.numberOfSupportPoints;
  const requiredPositionsCount = points === 3 ? 3 : 4;
  const prescribedLoad = calculatePrescribedEccentricLoad(instrument);
  const clause = points === 3
    ? 'OIML R 76-1:2006 clause 3.6.2.1 / A.4.7.1 (3 support points)'
    : 'OIML R 76-1:2006 clause 3.6.2.1 / A.4.7.1 (quarter segments for <= 4 support points)';

  // Only valid observations count toward completeness; empty or invalid observations are excluded
  const validObservations = observations.filter(o => isEccentricObservationValid(o, instrument));
  const invalidObservations = observations.filter(o => !isEccentricObservationValid(o, instrument));

  const testedPositions = validObservations
    .map(o => String(o.positionId ?? '').trim())
    .filter(id => id.length > 0);

  const uniqueTested = Array.from(new Set(testedPositions.map(id => id.toLowerCase())));
  const testedPositionsCount = uniqueTested.length;
  const missingPositionsCount = Math.max(0, requiredPositionsCount - testedPositionsCount);

  if (missingPositionsCount === 0 && invalidObservations.length === 0) {
    return {
      isComplete: true,
      prescribedLoad,
      requiredPositionsCount,
      testedPositionsCount,
      missingPositionsCount: 0,
      testedPositions,
      missingPositions: [],
      clause,
    };
  }

  const expectedStandardIds = Array.from({ length: requiredPositionsCount }, (_, i) => String(i + 1));
  const missingPositions: string[] = [];

  for (const expected of expectedStandardIds) {
    const isTested = uniqueTested.some(id => {
      return (
        id === expected ||
        id === `position-${expected}` ||
        id === `pos-${expected}` ||
        id === `pos${expected}` ||
        id === `quarter-${expected}` ||
        id === `quarter ${expected}`
      );
    });
    if (!isTested) {
      missingPositions.push(expected);
    }
  }

  while (missingPositions.length < missingPositionsCount) {
    const nextNum = missingPositions.length + 1;
    missingPositions.push(String(nextNum));
  }

  const invalidDetails = invalidObservations.map((obs) => {
    const loadVal = validateEccentricLoad(obs?.appliedLoad, instrument);
    if (!loadVal.isValid) {
      return `Position ${obs?.positionId ?? 'unknown'}: ${loadVal.error}`;
    }
    return `Position ${obs?.positionId ?? 'unknown'} has invalid observation data`;
  });

  let message = `Incomplete eccentric loading test: Instrument has ${points || 4} support points requiring ${requiredPositionsCount} loading positions (${clause}). Prescribed test load: ${prescribedLoad} kg (1/3 Max). Only ${testedPositionsCount} distinct valid position(s) tested.`;
  if (missingPositionsCount > 0) {
    message += ` Missing ${missingPositionsCount} required position(s): ${missingPositions.map(p => `Position ${p}`).join(', ')}.`;
  }
  if (invalidDetails.length > 0) {
    message += ` Invalid observation(s): ${invalidDetails.join('; ')}.`;
  }

  return {
    isComplete: false,
    prescribedLoad,
    requiredPositionsCount,
    testedPositionsCount,
    missingPositionsCount,
    testedPositions,
    missingPositions,
    clause,
    message,
  };
}

/**
 * Evaluates an entire eccentric loading test across all supported positions.
 *
 * Precedence rules:
 * - If any position exceeds MPE and cannot be retested: FAIL.
 * - If any position requires retest (and no fail): REQUIRES_RETEST.
 * - If all evaluated positions pass but procedure is incomplete: INCOMPLETE (or throws when requireComplete).
 * - PASS only when all required positions are tested and within MPE.
 */
export function evaluateEccentricLoadingTest(
  observations: EccentricLoadingObservation[],
  instrument: Instrument,
  context: VerificationContext,
  zeroDeterminedBeforeEachLoading: boolean = false,
  requireComplete: boolean = true
): EccentricityTestResult {
  if (observations.length === 0) {
    throw new Error('No observations provided for eccentric loading test.');
  }

  const prescribedLoad = calculatePrescribedEccentricLoad(instrument);

  const observationResults = observations.map(obs => 
    evaluateEccentricPosition(obs, instrument, context, zeroDeterminedBeforeEachLoading)
  );

  const completeness = checkEccentricCompleteness(observations, instrument);

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

  // Prevent an unsupported PASS when required positions have not been tested
  if (overallOutcome === TestOutcome.Pass && !completeness.isComplete) {
    if (requireComplete) {
      throw new Error(completeness.message);
    } else {
      overallOutcome = TestOutcome.Incomplete;
    }
  }

  return {
    outcome: overallOutcome,
    maxAbsoluteError,
    observationResults,
    retestRequired,
    prescribedLoad,
    completeness,
    r76Reference: 'R76-1 (2006) clause 3.6.2, A.4.7',
    explanation: `Eccentric loading test overall outcome: ${overallOutcome.toUpperCase()}. Prescribed test load: ${prescribedLoad} kg. Max absolute error: ${maxAbsoluteError} kg.`
  };
}
