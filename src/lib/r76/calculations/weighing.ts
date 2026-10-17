import { WeighingPerformanceObservation } from '../types/observations';
import { ObservationComplianceResult, TestComplianceResult, TestOutcome } from '../types/results';
import type { ComplianceTrace } from '../types/results';
import { calculateMPE } from './mpe';
import { Instrument, AccuracyClass } from '../types/instrument';
import { VerificationContext, isTypeEvaluationContext } from '../types/verification';

export interface WeighingPerformanceObservationResult extends ObservationComplianceResult {
  indicationPriorToRounding: number;
  errorPriorToRounding: number;
  /** Structured Compliance Trace for this observation. */
  trace: ComplianceTrace;
}

export interface WeighingCompletenessResult {
  isComplete: boolean;
  requiredMinLoadPoints: number;
  requiredLoadsCount?: number;
  distinctLoadPointsCount: number;
  testedLoadsCount?: number;
  hasIncreasing: boolean;
  hasDecreasing: boolean;
  increasingOrdered?: boolean;
  decreasingOrdered?: boolean;
  sequencePhasingValid?: boolean;
  testedMin: boolean;
  coversMin?: boolean;
  testedMax: boolean;
  coversMax?: boolean;
  testedTransitionPoints: boolean;
  missingRequirements: string[];
  clause: string;
  message?: string;
}

export interface WeighingPerformanceTestResult extends TestComplianceResult {
  observationResults: WeighingPerformanceObservationResult[];
  /** Compliance traces for each observation, in sequence order. */
  traces: ComplianceTrace[];
  /** Regulatory completeness details per OIML R 76-1:2006 Annex A.4.4.1. */
  completeness?: WeighingCompletenessResult;
}

/**
 * Fixes typical JavaScript floating point inaccuracies for display and comparison.
 */
export function fixFloat(val: number): number {
  return Math.round(val * 1e8) / 1e8;
}

export interface LoadValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates an applied test load against instrument Min and Max,
 * accounting for explicitly permitted exceptions in OIML R 76-1 Annex A.4.4.1 (e.g. zero load).
 */
export function validateWeighingLoad(
  load: number | undefined | null,
  instrument: { min?: number; max?: number }
): LoadValidationResult {
  if (load === undefined || load === null || typeof load !== 'number' || !Number.isFinite(load)) {
    return { isValid: false, error: 'Load must be a valid finite number.' };
  }
  if (load < 0) {
    return { isValid: false, error: 'Load cannot be negative.' };
  }
  if (instrument.max !== undefined && fixFloat(load) > fixFloat(instrument.max)) {
    return {
      isValid: false,
      error: `Load ${load} kg exceeds instrument Max capacity (${instrument.max} kg).`,
    };
  }
  if (
    instrument.min !== undefined &&
    fixFloat(load) > 0 &&
    fixFloat(load) < fixFloat(instrument.min)
  ) {
    return {
      isValid: false,
      error: `Load ${load} kg is below instrument Min capacity (${instrument.min} kg).`,
    };
  }
  return { isValid: true };
}

/**
 * Validates a string or numeric load input against instrument Min and Max.
 */
export function validateWeighingLoadInput(
  rawLoad: string | number | undefined | null,
  instrument?: { min?: number; max?: number }
): LoadValidationResult {
  if (rawLoad === undefined || rawLoad === null) {
    return { isValid: false, error: 'Load is required.' };
  }
  if (typeof rawLoad === 'string') {
    const trimmed = rawLoad.trim();
    if (trimmed === '') {
      return { isValid: false, error: 'Load is required.' };
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return { isValid: false, error: 'Load must be a valid number.' };
    }
    return validateWeighingLoad(parsed, instrument ?? {});
  }
  return validateWeighingLoad(rawLoad, instrument ?? {});
}

/**
 * Checks whether a single weighing performance observation is structurally and metrologically valid.
 */
export function isWeighingObservationValid(
  obs: WeighingPerformanceObservation,
  instrument: Instrument
): boolean {
  if (!obs) return false;
  if (obs.load === undefined || obs.load === null || typeof obs.load !== 'number' || !Number.isFinite(obs.load)) return false;
  const loadCheck = validateWeighingLoad(obs.load, instrument);
  if (!loadCheck.isValid) return false;
  if (obs.indicatedValue === undefined || obs.indicatedValue === null || typeof obs.indicatedValue !== 'number' || !Number.isFinite(obs.indicatedValue)) return false;
  if (obs.additionalLoad === undefined || obs.additionalLoad === null || typeof obs.additionalLoad !== 'number' || !Number.isFinite(obs.additionalLoad)) return false;
  if (obs.zeroError === undefined || obs.zeroError === null || typeof obs.zeroError !== 'number' || !Number.isFinite(obs.zeroError)) return false;
  if (obs.loadingDirection !== 'increasing' && obs.loadingDirection !== 'decreasing') return false;
  return true;
}

/**
 * Returns the Table 6 MPE transition point loads in kg for the instrument's accuracy class,
 * filtered to those strictly within (min, max).
 */
export function getMPETransitionPoints(instrument: Instrument): number[] {
  const e = instrument.e;
  const multipliersByClass: Record<string, number[]> = {
    [AccuracyClass.I]: [50000, 200000],
    [AccuracyClass.II]: [5000, 20000],
    [AccuracyClass.III]: [500, 2000],
    [AccuracyClass.IIII]: [50, 200],
  };

  const multipliers = multipliersByClass[instrument.accuracyClass] ?? [];
  return multipliers
    .map(m => fixFloat(m * e))
    .filter(load => load < instrument.max && load > instrument.min);
}

/**
 * Verifies whether the weighing performance test procedure is complete per
 * OIML R 76-1:2006 Annex A.4.4.1.
 *
 * Checks:
 * 1. Minimum number of distinct test loads (>= 10 for Type Evaluation, >= 5 for Verification).
 * 2. Both increasing and decreasing load sequences are present.
 * 3. Test load at or near Min (if Min >= 100 mg / 0.0001 kg).
 * 4. Test load at or reaching Max (loads exceeding Max are rejected and cannot satisfy Max).
 * 5. Test loads covering applicable Table 6 MPE transition points.
 * 6. Only valid, non-empty observations count toward completeness.
 */
export function checkWeighingCompleteness(
  observations: WeighingPerformanceObservation[],
  instrument: Instrument,
  context: VerificationContext | string
): WeighingCompletenessResult {
  const isTypeEval = isTypeEvaluationContext(context);
  const requiredMinLoadPoints = isTypeEval ? 10 : 5;
  const clause = isTypeEval
    ? 'OIML R 76-1:2006 Annex A.4.4.1 (Type evaluation / initial intrinsic error: >= 10 test loads, increasing & decreasing)'
    : 'OIML R 76-1:2006 Annex A.4.4.1 (Verification weighing test: >= 5 test loads, increasing & decreasing)';

  // Only valid observations count toward completeness; empty or invalid observations are excluded
  const validObservations = observations.filter(o => isWeighingObservationValid(o, instrument));
  const invalidObservations = observations.filter(o => !isWeighingObservationValid(o, instrument));

  const distinctLoads = Array.from(new Set(validObservations.map(o => fixFloat(o.load))));
  const distinctLoadPointsCount = distinctLoads.length;

  // Sort valid observations by sequenceIndex (or array index if sequenceIndex is same or undefined)
  const sortedValidObs = [...validObservations].sort((a, b) => {
    const seqA = a.sequenceIndex ?? 0;
    const seqB = b.sequenceIndex ?? 0;
    return seqA - seqB;
  });

  const incObs = sortedValidObs.filter(o => o.loadingDirection === 'increasing');
  const decObs = sortedValidObs.filter(o => o.loadingDirection === 'decreasing');

  const hasIncreasing = incObs.length > 0;
  const hasDecreasing = decObs.length > 0;

  // Annex A.4.4.1: Increasing loading sequence must be monotonically non-decreasing (L_{i+1} >= L_i).
  // Legitimate repeated load points (L_{i+1} == L_i) are explicitly preserved.
  let increasingOrdered = true;
  let increasingOrderError: string | undefined;
  for (let i = 0; i < incObs.length - 1; i++) {
    const currentLoad = fixFloat(incObs[i].load);
    const nextLoad = fixFloat(incObs[i + 1].load);
    if (nextLoad < currentLoad) {
      increasingOrdered = false;
      increasingOrderError = `Increasing loading sequence is incorrectly ordered: load at step ${i + 2} (${nextLoad} kg) is less than preceding load at step ${i + 1} (${currentLoad} kg). Annex A.4.4.1 requires loading in non-decreasing order.`;
      break;
    }
  }

  // Annex A.4.4.1: Decreasing unloading sequence must be monotonically non-increasing (L_{j+1} <= L_j).
  // Legitimate repeated load points (L_{j+1} == L_j) are explicitly preserved.
  let decreasingOrdered = true;
  let decreasingOrderError: string | undefined;
  for (let j = 0; j < decObs.length - 1; j++) {
    const currentLoad = fixFloat(decObs[j].load);
    const nextLoad = fixFloat(decObs[j + 1].load);
    if (nextLoad > currentLoad) {
      decreasingOrdered = false;
      decreasingOrderError = `Decreasing unloading sequence is incorrectly ordered: load at step ${j + 2} (${nextLoad} kg) is greater than preceding load at step ${j + 1} (${currentLoad} kg). Annex A.4.4.1 requires unloading in non-increasing order.`;
      break;
    }
  }

  // Annex A.4.4.1: Sequence phasing: apply test loads in increasing order up to Max, then remove back to zero.
  // Decreasing observations must not appear before the increasing sequence is completed.
  let sequencePhasingValid = true;
  let sequencePhaseError: string | undefined;
  if (incObs.length > 0 && decObs.length > 0) {
    let lastIncIdx = -1;
    let firstDecIdx = -1;
    for (let k = 0; k < sortedValidObs.length; k++) {
      if (sortedValidObs[k].loadingDirection === 'increasing') lastIncIdx = k;
      if (sortedValidObs[k].loadingDirection === 'decreasing' && firstDecIdx === -1) firstDecIdx = k;
    }
    if (firstDecIdx !== -1 && lastIncIdx !== -1 && firstDecIdx < lastIncIdx) {
      sequencePhasingValid = false;
      sequencePhaseError = 'Weighing sequence order violated: decreasing (unloading) observations occur before increasing loading sequence is complete (Annex A.4.4.1).';
    }
  }

  const e = instrument.e;
  const minLoad = distinctLoads.length > 0 ? Math.min(...distinctLoads) : Infinity;
  const maxLoad = distinctLoads.length > 0 ? Math.max(...distinctLoads) : -Infinity;

  // Min check: only mandatory if Min >= 100 mg (0.0001 kg) per A.4.4.1
  const minRequired = instrument.min >= 0.0001;
  const testedMin = validObservations.length > 0 && (!minRequired || minLoad <= fixFloat(instrument.min + e));

  // Max check: highest valid load must reach Max and must not exceed Max
  const testedMax =
    validObservations.length > 0 &&
    maxLoad >= fixFloat(instrument.max - e) &&
    maxLoad <= fixFloat(instrument.max);

  // Transition points check:
  const transitionPoints = getMPETransitionPoints(instrument);
  const missingTransitions: number[] = [];

  for (const tp of transitionPoints) {
    // Satisfied if at least one load is near the transition point,
    // or if loads span across the transition boundary (one <= tp, one > tp)
    const hasNear = distinctLoads.some(l => Math.abs(l - tp) <= fixFloat(Math.max(5 * e, tp * 0.1)));
    const hasBelowOrAt = distinctLoads.some(l => l <= tp);
    const hasAbove = distinctLoads.some(l => l > tp);
    if (!hasNear && (!hasBelowOrAt || !hasAbove)) {
      missingTransitions.push(tp);
    }
  }
  const testedTransitionPoints = missingTransitions.length === 0;

  const missingRequirements: string[] = [];

  if (invalidObservations.length > 0) {
    const invalidDetails = invalidObservations.map((obs, idx) => {
      const loadVal = validateWeighingLoad(obs?.load, instrument);
      if (!loadVal.isValid) {
        return `Observation ${obs?.sequenceIndex ?? idx + 1}: ${loadVal.error}`;
      }
      return `Observation ${obs?.sequenceIndex ?? idx + 1} has invalid observation data`;
    });
    missingRequirements.push(invalidDetails.join('; '));
  }

  if (distinctLoadPointsCount < requiredMinLoadPoints) {
    missingRequirements.push(
      `Requires at least ${requiredMinLoadPoints} different valid test loads for ${isTypeEval ? 'Type Evaluation' : 'Verification'} (only ${distinctLoadPointsCount} provided)`
    );
  }
  if (!hasIncreasing) {
    missingRequirements.push('Missing increasing load sequence (Annex A.4.4.1)');
  } else if (!increasingOrdered && increasingOrderError) {
    missingRequirements.push(increasingOrderError);
  }
  if (!hasDecreasing) {
    missingRequirements.push('Missing decreasing load sequence (Annex A.4.4.1)');
  } else if (!decreasingOrdered && decreasingOrderError) {
    missingRequirements.push(decreasingOrderError);
  }
  if (!sequencePhasingValid && sequencePhaseError) {
    missingRequirements.push(sequencePhaseError);
  }
  if (!testedMin) {
    missingRequirements.push(`Missing test load at or near Min (${instrument.min} kg)`);
  }
  if (!testedMax) {
    missingRequirements.push(`Missing test load reaching Max (${instrument.max} kg)`);
  }
  if (!testedTransitionPoints) {
    missingRequirements.push(
      `Missing test loads at or covering MPE transition point(s): ${missingTransitions.map(t => `${t} kg`).join(', ')}`
    );
  }

  const isComplete = missingRequirements.length === 0;
  let message: string | undefined;

  if (!isComplete) {
    message = `Incomplete weighing performance test per ${clause}: ${missingRequirements.join('; ')}.`;
  }

  return {
    isComplete,
    requiredMinLoadPoints,
    requiredLoadsCount: requiredMinLoadPoints,
    distinctLoadPointsCount,
    testedLoadsCount: distinctLoadPointsCount,
    hasIncreasing,
    hasDecreasing,
    increasingOrdered,
    decreasingOrdered,
    sequencePhasingValid,
    testedMin,
    coversMin: testedMin,
    testedMax,
    coversMax: testedMax,
    testedTransitionPoints,
    missingRequirements,
    clause,
    message,
  };
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

  // Validate load against MPE Table 6 maximum scale intervals
  const mpeResult = calculateMPE(instrument.accuracyClass, L, e, context);
  const mpe = mpeResult.effectiveMPE;

  // Validate load against instrument Min and Max capacity per OIML procedure
  const loadValidation = validateWeighingLoad(obs.load, instrument);
  if (!loadValidation.isValid) {
    throw new Error(loadValidation.error ?? 'Invalid test load.');
  }

  // P = I + 0.5e - ΔL
  const P = fixFloat(I + 0.5 * e - deltaL);
  
  // E = P - L
  const E = fixFloat(P - L);
  
  // Ec = E - E0
  const Ec = fixFloat(E - E0);
  
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
 * Evaluates an entire weighing performance test run by aggregating observation results
 * and validating procedure completeness per OIML R 76-1:2006 Annex A.4.4.1.
 *
 * Precedence rules:
 * - If any observation exceeds MPE: outcome is FAIL.
 * - Else if the procedure is incomplete (missing load points, sequences, directions): outcome is INCOMPLETE.
 * - Only if all observations pass and the procedure is complete: outcome is PASS.
 */
export function evaluateWeighingPerformanceTest(
  observations: WeighingPerformanceObservation[],
  instrument: Instrument,
  context: VerificationContext,
  requireComplete: boolean = true
): WeighingPerformanceTestResult {
  if (observations.length === 0) {
    throw new Error('No observations provided for weighing performance test.');
  }

  const observationResults = observations.map((obs, idx) => {
    try {
      return evaluateWeighingObservation(obs, instrument, context);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Weighing performance observation ${obs?.sequenceIndex ?? idx + 1} (load: ${obs?.load} kg): ${msg}`);
    }
  });
  
  const anyFail = observationResults.some(r => r.outcome === TestOutcome.Fail);
  const completeness = checkWeighingCompleteness(observations, instrument, context);

  let maxAbsoluteError = 0;
  for (const r of observationResults) {
    const absError = Math.abs(r.calculatedError);
    if (absError > maxAbsoluteError) {
      maxAbsoluteError = absError;
    }
  }

  let outcome: TestOutcome;
  let explanation: string;

  if (anyFail) {
    outcome = TestOutcome.Fail;
    explanation = `Weighing performance test FAILED with max absolute error ${maxAbsoluteError} kg (exceeded permissible MPE).`;
  } else if (requireComplete && !completeness.isComplete) {
    outcome = TestOutcome.Incomplete;
    explanation = completeness.message || 'Weighing performance test is INCOMPLETE: procedure requirements not satisfied.';
  } else {
    outcome = TestOutcome.Pass;
    explanation = `Weighing performance test PASSED with max absolute error ${maxAbsoluteError} kg across all required load points.`;
  }

  return {
    outcome,
    maxAbsoluteError,
    observationResults,
    traces: observationResults.map(r => r.trace),
    r76Reference: 'R76-1 (2006) clause 3.5.1, Table 6, Annex A.4.4.1',
    explanation,
    completeness,
  };
}
