import { RepeatabilityObservation, RepeatabilitySeries } from '../types/observations';
import { TestComplianceResult, TestOutcome } from '../types/results';
import type { ComplianceTrace } from '../types/results';
import { calculateMPE } from './mpe';
import { Instrument, AccuracyClass } from '../types/instrument';
import { VerificationContext, normalizeVerificationContext, isTypeEvaluationContext } from '../types/verification';

export interface RepeatabilitySeriesResult {
  seriesNumber: number;
  testLoad: number;
  numberOfWeighings: number;
  iMax: number;
  iMin: number;
  repeatabilityRange: number;
  mpe: number;
  outcome: TestOutcome;
  trace: ComplianceTrace;
  explanation: string;
}

export interface RepeatabilityCompletenessResult {
  isComplete: boolean;
  requiredSeriesCount: number;
  testedSeriesCount: number;
  missingSeriesCount?: number;
  requiredWeighingsPerSeries: number;
  missingRequirements: string[];
  clause: string;
  message?: string;
}

export interface RepeatabilityTestResult extends TestComplianceResult {
  testLoad: number;
  numberOfWeighings: number;
  iMax: number;
  iMin: number;
  mpe: number;
  /** Structured Compliance Trace for the repeatability test (primary/worst series). */
  trace: ComplianceTrace;
  /** Detailed results for each evaluated series. */
  seriesResults?: RepeatabilitySeriesResult[];
  /** Regulatory completeness details per OIML R 76-1:2006 Annex A.4.10. */
  completeness?: RepeatabilityCompletenessResult;
}

/**
 * Fixes typical JavaScript floating point inaccuracies for display and comparison.
 */
function fixFloat(val: number): number {
  return Math.round(val * 1e8) / 1e8;
}

/**
 * Normalizes RepeatabilityObservation to a uniform array of series.
 */
export function normalizeRepeatabilitySeries(obs: RepeatabilityObservation): RepeatabilitySeries[] {
  if (obs.series && obs.series.length > 0) {
    return obs.series;
  }
  if (obs.testLoad !== undefined && obs.indications && obs.indications.length > 0) {
    return [{
      seriesNumber: 1,
      testLoad: obs.testLoad,
      indications: obs.indications,
    }];
  }
  return [];
}

/**
 * Evaluates a single repeatability series according to R76-1 (2006) A.4.10 / 3.6.1.
 */
export function evaluateSingleRepeatabilitySeries(
  series: RepeatabilitySeries,
  instrument: Instrument,
  context: VerificationContext | string,
  autoZeroOrTrackingActive: boolean,
  requiredWeighings: number
): RepeatabilitySeriesResult {
  if (series.indications.length < 2) {
    throw new Error(
      `Repeatability series ${series.seriesNumber} must have at least 2 weighings to determine range. Provided ${series.indications.length}.`
    );
  }

  const iMax = Math.max(...series.indications);
  const iMin = Math.min(...series.indications);
  const R = fixFloat(iMax - iMin);

  let mpeResult;
  try {
    mpeResult = calculateMPE(instrument.accuracyClass, series.testLoad, instrument.e, context);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Repeatability test (test load: ${series.testLoad} kg): ${msg}`);
  }
  const mpe = mpeResult.effectiveMPE;
  const isPass = (R - mpe) <= 1e-9;
  const outcome = isPass ? TestOutcome.Pass : TestOutcome.Fail;

  const indicationsList = series.indications.map((v, i) => `I${i + 1} = ${v} kg`).join(', ');

  const trace: ComplianceTrace = {
    instrumentContext: {
      'Accuracy Class': instrument.accuracyClass,
      'Max (kg)': instrument.max,
      'Min (kg)': instrument.min,
      'e (kg)': instrument.e,
      'd (kg)': instrument.d,
      'Verification Context': mpeResult.mpeTrace.verificationContext,
      'Series Number': series.seriesNumber,
      'Required weighings': requiredWeighings,
      'Auto-zero / tracking active': autoZeroOrTrackingActive,
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
      'Series Number': series.seriesNumber,
      'Test load L (kg)': series.testLoad,
      'Number of weighings': series.indications.length,
      'Indications': indicationsList,
      'Imax (kg)': iMax,
      'Imin (kg)': iMin,
    },
    calculationSteps: [
      {
        label: 'Maximum indication (Imax)',
        formula: 'Imax = max(I1, I2, …, In)',
        substitutedFormula: `Imax = max(${series.indications.join(', ')})`,
        result: iMax,
        unit: 'kg',
      },
      {
        label: 'Minimum indication (Imin)',
        formula: 'Imin = min(I1, I2, …, In)',
        substitutedFormula: `Imin = min(${series.indications.join(', ')})`,
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
    seriesNumber: series.seriesNumber,
    testLoad: series.testLoad,
    numberOfWeighings: series.indications.length,
    iMax,
    iMin,
    repeatabilityRange: R,
    mpe,
    outcome,
    trace,
    explanation: `Series ${series.seriesNumber} (Load: ${series.testLoad} kg, ${series.indications.length} weighings): Imax=${iMax}, Imin=${iMin}, R=${R} kg, MPE=±${mpe} kg ➔ ${outcome.toUpperCase()}.`,
  };
}

/**
 * Evaluates a repeatability test observation according to R76-1 (2006) A.4.10 / 3.6.1.
 *
 * Precedence rules:
 * - If any evaluated series fails (R > MPE): outcome is FAIL.
 * - Else if the procedure is incomplete (missing series, insufficient weighings): outcome is INCOMPLETE.
 * - Only if all required series are complete and within MPE: outcome is PASS.
 */
export function evaluateRepeatabilityTest(
  obs: RepeatabilityObservation,
  instrument: Instrument,
  context: VerificationContext | string,
  requireComplete: boolean = true
): RepeatabilityTestResult {
  // 1. Enforce zero-tracking requirement (A.4.10)
  if (instrument.hasAutoZeroOrTracking && !obs.autoZeroOrTrackingActive) {
    throw new Error('Automatic zero-setting/zero-tracking must be active during the repeatability test.');
  }

  // 2. Determine regulatory requirements per A.4.10
  const normContext = normalizeVerificationContext(context);
  const isTypeEval = isTypeEvaluationContext(normContext);
  const requiredSeriesCount = isTypeEval ? 2 : 1;
  let requiredWeighings: number;

  if (isTypeEval) {
    // A.4.10: For Max < 1000 kg each series shall consist of 10 weighings. In other cases at least 3 weighings.
    requiredWeighings = instrument.max < 1000 ? 10 : 3;
  } else {
    // A.4.10 3rd paragraph: 6 weighings for classes I and II, 3 weighings for classes III and IIII.
    requiredWeighings = (instrument.accuracyClass === AccuracyClass.I || instrument.accuracyClass === AccuracyClass.II)
      ? 6
      : 3;
  }

  const clause = isTypeEval
    ? 'OIML R 76-1:2006 Annex A.4.10 (Type evaluation: 2 series at ~0.5 Max and close to Max, ' +
      (instrument.max < 1000 ? '10 weighings each' : '>= 3 weighings each') + ')'
    : `OIML R 76-1:2006 Annex A.4.10 (Verification: 1 series, >= ${requiredWeighings} weighings for Accuracy Class ${instrument.accuracyClass})`;

  // 3. Normalize series
  const seriesList = normalizeRepeatabilitySeries(obs);
  if (seriesList.length === 0) {
    throw new Error('No observations provided for repeatability test.');
  }

  // Preserve legacy rejection for single-series verification when indications count does not match
  if (!isTypeEval && !obs.series) {
    if (seriesList[0].indications.length !== requiredWeighings) {
      throw new Error(
        `Accuracy Class ${instrument.accuracyClass} requires exactly ${requiredWeighings} weighings for repeatability. Provided ${seriesList[0].indications.length}.`
      );
    }
  }

  // 4. Evaluate each series independently
  const seriesResults = seriesList.map(s =>
    evaluateSingleRepeatabilitySeries(s, instrument, normContext, obs.autoZeroOrTrackingActive, requiredWeighings)
  );

  // 5. Check completeness
  const missingRequirements: string[] = [];
  if (seriesList.length < requiredSeriesCount) {
    missingRequirements.push(
      `Requires ${requiredSeriesCount} series of weighings for ${isTypeEval ? 'Type Evaluation' : 'Verification'} (only ${seriesList.length} provided)`
    );
  }

  for (const s of seriesList) {
    if (s.indications.length < requiredWeighings) {
      missingRequirements.push(
        `Series ${s.seriesNumber} has ${s.indications.length} weighings (requires at least ${requiredWeighings})`
      );
    }
  }

  if (isTypeEval && seriesList.length >= 2) {
    const loads = seriesList.map(s => s.testLoad).sort((a, b) => a - b);
    const lowLoad = loads[0];
    const highLoad = loads[loads.length - 1];
    // Series 1: ~0.5 Max (between 0.35 Max and 0.65 Max)
    const isNearHalfMax = lowLoad >= instrument.max * 0.35 && lowLoad <= instrument.max * 0.65;
    // Series 2: close to Max (between 0.8 Max and 1.05 Max)
    const isNearMax = highLoad >= instrument.max * 0.8 && highLoad <= instrument.max * 1.05;
    if (!isNearHalfMax) {
      missingRequirements.push(
        `Series 1 test load (${lowLoad} kg) must be approximately 0.5 Max (${fixFloat(instrument.max * 0.5)} kg)`
      );
    }
    if (!isNearMax) {
      missingRequirements.push(
        `Series 2 test load (${highLoad} kg) must be close to Max (${instrument.max} kg)`
      );
    }
  }

  const isComplete = missingRequirements.length === 0;
  const completeness: RepeatabilityCompletenessResult = {
    isComplete,
    requiredSeriesCount,
    testedSeriesCount: seriesList.length,
    missingSeriesCount: Math.max(0, requiredSeriesCount - seriesList.length),
    requiredWeighingsPerSeries: requiredWeighings,
    missingRequirements,
    clause,
    message: isComplete ? undefined : `Incomplete repeatability test per ${clause}: ${missingRequirements.join('; ')}.`,
  };

  // 6. Aggregate results
  const anyFail = seriesResults.some(r => r.outcome === TestOutcome.Fail);
  const maxRange = Math.max(...seriesResults.map(r => r.repeatabilityRange));

  // Worst/primary series for top-level result fields
  const primarySeries = seriesResults.find(r => r.outcome === TestOutcome.Fail) || seriesResults[0];

  let outcome: TestOutcome;
  let explanation: string;

  if (anyFail) {
    outcome = TestOutcome.Fail;
    const failingSeries = seriesResults.filter(r => r.outcome === TestOutcome.Fail);
    explanation = `Repeatability test FAILED: ${failingSeries.map(s => `Series ${s.seriesNumber} spread ${s.repeatabilityRange} kg > MPE ${s.mpe} kg`).join('; ')}. Max range: ${maxRange} kg.`;
  } else if (requireComplete && !completeness.isComplete) {
    outcome = TestOutcome.Incomplete;
    explanation = completeness.message || 'Repeatability test is INCOMPLETE: required series or repetitions missing.';
  } else {
    outcome = TestOutcome.Pass;
    explanation = `Repeatability test PASSED: all ${seriesResults.length} series satisfied R ≤ MPE (max spread: ${maxRange} kg).`;
  }

  return {
    outcome,
    maxAbsoluteError: maxRange,
    observationResults: [],
    repeatabilityRange: maxRange,
    testLoad: primarySeries.testLoad,
    numberOfWeighings: seriesResults.reduce((acc, s) => acc + s.numberOfWeighings, 0),
    iMax: primarySeries.iMax,
    iMin: primarySeries.iMin,
    mpe: primarySeries.mpe,
    trace: primarySeries.trace,
    seriesResults,
    completeness,
    r76Reference: isTypeEval ? 'R76-1 (2006) clause 3.6.1, A.4.10' : 'R76-1 (2006) clause 3.6.1, A.4.10 (3rd paragraph)',
    explanation,
  };
}
