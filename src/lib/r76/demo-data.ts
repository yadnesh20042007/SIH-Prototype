/**
 * @file demo-data.ts
 * @description Generates mathematically valid, regulation-compliant demo data
 * for OIML R 76-1 test modules.
 *
 * Generated values satisfy all validation rules and produce genuine PASS results
 * when processed by the actual calculation and evaluation engine.
 */

import {
  AccuracyClass,
  VerificationContext,
  isTypeEvaluationContext,
} from './types';
import { fixFloat, getMPETransitionPoints } from './calculations/weighing';
import {
  generateRowId,
  requiredRepeatabilityWeighingsCount,
  type WeighingRowState,
  type RepeatabilityFormState,
  type EccentricRowState,
  type DiscriminationRowState,
  type ZeroSettingFormState,
} from '@/components/Evaluation/types';

export interface DemoInstrumentConfig {
  accuracyClass: AccuracyClass;
  max: number | string;
  min: number | string;
  e: number | string;
  d: number | string;
  numberOfSupportPoints?: number | string;
  hasAutoZeroOrTracking?: boolean;
  hasInitialZeroSettingDevice?: boolean;
  initialZeroSettingRange?: number | string;
  hasFineDisplayDevice?: boolean;
  indicationType?: string | null;
  zeroSettingMechanisms?: string[];
  instrumentType?: string;
}

export interface DemoResult<T> {
  success: boolean;
  data?: T;
  reason?: string;
}

export interface AllDemoDataResult {
  weighing?: DemoResult<WeighingRowState[]>;
  repeatability?: DemoResult<RepeatabilityFormState>;
  eccentric?: DemoResult<EccentricRowState[]>;
  discrimination?: DemoResult<DiscriminationRowState[]>;
  zeroSetting?: DemoResult<ZeroSettingFormState>;
}

/**
 * Generates sample Weighing Performance test observations.
 * Annex A.4.4.1 requires:
 * - At least 10 distinct test loads for Type Evaluation, or 5 for Verification
 * - Both increasing and decreasing sequences
 * - Test load at or near Min
 * - Test load reaching Max
 * - Test loads covering applicable Table 6 MPE transition points
 *
 * Setting indicatedValue = load, additionalLoad = 0.5e, zeroError = 0 yields:
 * P = I + 0.5e - ΔL = load + 0.5e - 0.5e = load
 * E = P - load = 0
 * Ec = E - zeroError = 0 <= MPE (guaranteed genuine PASS)
 */
export function generateWeighingPerformanceDemo(
  instrument: DemoInstrumentConfig,
  context: VerificationContext | string
): DemoResult<WeighingRowState[]> {
  const max = Number(instrument.max);
  const min = Number(instrument.min);
  const e = Number(instrument.e);

  if (!Number.isFinite(max) || max <= 0) {
    return { success: false, reason: 'Instrument Max capacity must be a positive number.' };
  }
  if (!Number.isFinite(min) || min < 0) {
    return { success: false, reason: 'Instrument Min capacity must be a non-negative number.' };
  }
  if (min >= max) {
    return { success: false, reason: 'Instrument Min capacity must be strictly less than Max capacity.' };
  }
  if (!Number.isFinite(e) || e <= 0) {
    return { success: false, reason: 'Verification scale interval (e) must be a positive number.' };
  }

  const isTypeEval = isTypeEvaluationContext(context);
  const targetCount = isTypeEval ? 10 : 5;

  const instObj: any = {
    accuracyClass: instrument.accuracyClass,
    max,
    min,
    e,
    d: Number(instrument.d) || e,
  };
  const transitionPoints = getMPETransitionPoints(instObj);

  const minLoad = fixFloat(min);
  const maxLoad = fixFloat(max);

  const loadSet = new Set<number>();
  loadSet.add(minLoad);
  for (const tp of transitionPoints) {
    if (tp > minLoad && tp < maxLoad) {
      loadSet.add(fixFloat(tp));
    }
  }
  loadSet.add(maxLoad);

  // Realistic intermediate test points as standard fractions of Max
  const standardFractions = [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9];
  for (const frac of standardFractions) {
    if (loadSet.size >= targetCount) break;
    const rawVal = frac * max;
    const roundedToE = fixFloat(Math.round(rawVal / e) * e);
    if (roundedToE > minLoad && roundedToE < maxLoad) {
      loadSet.add(roundedToE);
    }
  }

  // Uniform interpolation if still under target count
  if (loadSet.size < targetCount) {
    const stepCount = targetCount + 2;
    for (let i = 1; i < stepCount && loadSet.size < targetCount; i++) {
      const interp = minLoad + (i / stepCount) * (maxLoad - minLoad);
      const roundedToE = fixFloat(Math.round(interp / e) * e);
      if (roundedToE > minLoad && roundedToE < maxLoad) {
        loadSet.add(roundedToE);
      }
    }
  }

  // Fallback: step multiples of e from minLoad
  if (loadSet.size < targetCount) {
    let current = fixFloat(minLoad + e);
    while (current < maxLoad && loadSet.size < targetCount) {
      loadSet.add(current);
      current = fixFloat(current + e);
    }
  }

  if (loadSet.size < targetCount) {
    return {
      success: false,
      reason: `Cannot generate ${targetCount} distinct multiples of scale interval e=${e} between Min=${min} and Max=${max}.`,
    };
  }

  const distinctLoads = Array.from(loadSet).sort((a, b) => a - b);
  const rows: WeighingRowState[] = [];

  // Increasing sequence
  for (const load of distinctLoads) {
    rows.push({
      id: generateRowId('w'),
      load: String(load),
      indicatedValue: String(load),
      additionalLoad: String(fixFloat(0.5 * e)),
      zeroError: '0',
      loadingDirection: 'increasing',
    });
  }

  // Decreasing sequence in reverse order back to Min
  for (const load of [...distinctLoads].reverse()) {
    rows.push({
      id: generateRowId('w'),
      load: String(load),
      indicatedValue: String(load),
      additionalLoad: String(fixFloat(0.5 * e)),
      zeroError: '0',
      loadingDirection: 'decreasing',
    });
  }

  return { success: true, data: rows };
}

/**
 * Generates sample Repeatability test observations.
 * Annex A.4.10:
 * - Type Evaluation: 2 series (~0.5 Max and close to Max), 10 weighings each (if Max < 1000 kg) or 3 weighings each
 * - Verification: 1 series (~0.8 Max), 6 weighings for Class I/II, 3 weighings for Class III/IIII
 * - Auto-zero tracking must remain active
 */
export function generateRepeatabilityDemo(
  instrument: DemoInstrumentConfig,
  context: VerificationContext | string
): DemoResult<RepeatabilityFormState> {
  const max = Number(instrument.max);
  const e = Number(instrument.e);

  if (!Number.isFinite(max) || max <= 0) {
    return { success: false, reason: 'Instrument Max capacity must be a positive number.' };
  }
  if (!Number.isFinite(e) || e <= 0) {
    return { success: false, reason: 'Verification scale interval (e) must be a positive number.' };
  }

  const isTypeEval = isTypeEvaluationContext(context);
  const requiredWeighings = requiredRepeatabilityWeighingsCount(
    instrument.accuracyClass,
    context,
    max
  );

  if (isTypeEval) {
    let s1Load = fixFloat(Math.round((0.5 * max) / e) * e);
    if (s1Load < 0.35 * max || s1Load > 0.65 * max || s1Load <= 0) {
      s1Load = fixFloat(0.5 * max);
    }

    let s2Load = fixFloat(Math.round(max / e) * e);
    if (s2Load < 0.8 * max || s2Load > 1.05 * max || s2Load <= 0) {
      s2Load = fixFloat(max);
    }

    const s1Indications = Array.from({ length: requiredWeighings }, () => String(s1Load));
    const s2Indications = Array.from({ length: requiredWeighings }, () => String(s2Load));

    const formState: RepeatabilityFormState = {
      testLoad: String(s1Load),
      indications: s1Indications,
      autoZeroOrTrackingActive: true,
      series: [
        {
          seriesNumber: 1,
          testLoad: String(s1Load),
          indications: s1Indications,
        },
        {
          seriesNumber: 2,
          testLoad: String(s2Load),
          indications: s2Indications,
        },
      ],
    };

    return { success: true, data: formState };
  }

  let testLoad = fixFloat(Math.round((0.8 * max) / e) * e);
  if (testLoad <= 0 || testLoad > max) {
    testLoad = fixFloat(0.8 * max);
  }

  const indications = Array.from({ length: requiredWeighings }, () => String(testLoad));

  const formState: RepeatabilityFormState = {
    testLoad: String(testLoad),
    indications,
    autoZeroOrTrackingActive: true,
  };

  return { success: true, data: formState };
}

/**
 * Generates sample Eccentric Loading test observations.
 * Clause 3.6.2.1 / Annex A.4.7.1:
 * - Prescribed test load: 1/3 * (Max + maximum additive tare effect)
 * - Required positions: 3 (for 3 support points) or 4 (for <= 4 support points)
 * - Auto-zero tracking must be disabled
 */
export function generateEccentricLoadingDemo(
  instrument: DemoInstrumentConfig
): DemoResult<EccentricRowState[]> {
  const max = Number(instrument.max);
  const e = Number(instrument.e);
  const supportPoints = Number(instrument.numberOfSupportPoints) || 4;

  if (!Number.isFinite(max) || max <= 0) {
    return { success: false, reason: 'Instrument Max capacity must be a positive number.' };
  }
  if (!Number.isFinite(e) || e <= 0) {
    return { success: false, reason: 'Verification scale interval (e) must be a positive number.' };
  }
  if (supportPoints > 4) {
    return {
      success: false,
      reason: 'Eccentric loading is unsupported for instruments with > 4 support points (manual review required per OIML R 76-1 clause 3.6.2.2).',
    };
  }

  const requiredPositions = supportPoints === 3 ? 3 : 4;
  const prescribedLoad = fixFloat(max / 3);

  const rows: EccentricRowState[] = [];
  for (let pos = 1; pos <= requiredPositions; pos++) {
    rows.push({
      id: generateRowId('e'),
      positionId: String(pos),
      appliedLoad: String(prescribedLoad),
      indicatedValue: String(prescribedLoad),
      additionalLoad: String(fixFloat(0.5 * e)),
      zeroError: '0',
      autoZeroOrTrackingDisabled: true,
    });
  }

  return { success: true, data: rows };
}

/**
 * Generates sample Digital Discrimination test observations.
 * Clause 3.8.2.2 / Annex A.4.8.2:
 * - Applies to Type Evaluation with digital indication and d >= 5 mg
 * - Tested at Min, 0.5 Max, and Max
 * - Additional load 1.4d must cause indication change of at least 1d (ΔI >= d)
 */
export function generateDiscriminationDemo(
  instrument: DemoInstrumentConfig,
  context: VerificationContext | string
): DemoResult<DiscriminationRowState[]> {
  const max = Number(instrument.max);
  const min = Number(instrument.min);
  const d = Number(instrument.d);

  if (!isTypeEvaluationContext(context)) {
    return {
      success: false,
      reason: 'Digital discrimination test applies to Type Evaluation only (OIML R 76-1 clause 3.8.2.2).',
    };
  }
  if (instrument.indicationType && instrument.indicationType.toLowerCase() !== 'digital') {
    return {
      success: false,
      reason: 'Only digital indication discrimination test is supported by the prototype (OIML R 76-1 clause A.4.8.2).',
    };
  }
  if (!Number.isFinite(d) || d < 0.000005) {
    return {
      success: false,
      reason: 'Discrimination test for digital indication requires scale interval d >= 5 mg (0.000005 kg) per OIML R 76-1 clause 3.8.2.2.',
    };
  }
  if (!Number.isFinite(max) || max <= 0) {
    return { success: false, reason: 'Instrument Max capacity must be a positive number.' };
  }

  const pMin = fixFloat(min);
  const pHalf = fixFloat(0.5 * max);
  const pMax = fixFloat(max);

  const loads = [pMin, pHalf, pMax];
  const rows: DiscriminationRowState[] = loads.map((load) => ({
    id: generateRowId('d'),
    testLoad: String(load),
    indicationBefore: String(load),
    indicationAfter: String(fixFloat(load + d)),
  }));

  return { success: true, data: rows };
}

/**
 * Generates sample Zero-Setting Accuracy test observations.
 * Clause 4.5.2 / Annex A.4.2.3:
 * - Load = 10e (brings automatic/tracking out of zero-tracking band)
 * - Additional load = 0.5e
 * - Raw error E0 = I + 0.5e - ΔL - L = 10e + 0.5e - 0.5e - 10e = 0 <= 0.25e
 */
export function generateZeroSettingDemo(
  instrument: DemoInstrumentConfig
): DemoResult<ZeroSettingFormState> {
  const e = Number(instrument.e);

  if (!Number.isFinite(e) || e <= 0) {
    return { success: false, reason: 'Verification scale interval (e) must be a positive number.' };
  }

  const mechanisms = instrument.zeroSettingMechanisms;
  if (!mechanisms || mechanisms.length === 0) {
    return {
      success: false,
      reason: 'No zero-setting mechanism is fitted on this instrument (OIML R 76-1 clause 4.5.2).',
    };
  }

  const load = fixFloat(10 * e);
  const indicatedValue = String(load);
  const additionalLoad = String(fixFloat(0.5 * e));

  return {
    success: true,
    data: {
      load: String(load),
      indicatedValue,
      additionalLoad,
    },
  };
}

/**
 * Generates demo data for all test modules applicable to the given instrument.
 */
export function generateAllDemoData(
  instrument: DemoInstrumentConfig,
  context: VerificationContext | string
): AllDemoDataResult {
  return {
    weighing: generateWeighingPerformanceDemo(instrument, context),
    repeatability: generateRepeatabilityDemo(instrument, context),
    eccentric: generateEccentricLoadingDemo(instrument),
    discrimination: generateDiscriminationDemo(instrument, context),
    zeroSetting: generateZeroSettingDemo(instrument),
  };
}

/**
 * Checks whether user has already entered readings in the Weighing Performance module.
 */
export function hasWeighingReadings(rows: WeighingRowState[]): boolean {
  return rows.some((r) => r.load.trim() !== '' || r.indicatedValue.trim() !== '');
}

/**
 * Checks whether user has already entered readings in the Repeatability module.
 */
export function hasRepeatabilityReadings(rep: RepeatabilityFormState): boolean {
  if (rep.testLoad.trim() !== '') return true;
  if (rep.indications.some((v) => v.trim() !== '')) return true;
  if (
    rep.series &&
    rep.series.some(
      (s) => s.testLoad.trim() !== '' || s.indications.some((v) => v.trim() !== '')
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Checks whether user has already entered readings in the Eccentric Loading module.
 */
export function hasEccentricReadings(rows: EccentricRowState[]): boolean {
  return rows.some((r) => r.appliedLoad.trim() !== '' || r.indicatedValue.trim() !== '');
}

/**
 * Checks whether user has already entered readings in the Discrimination module.
 */
export function hasDiscriminationReadings(rows: DiscriminationRowState[]): boolean {
  return rows.some(
    (r) =>
      r.testLoad.trim() !== '' ||
      r.indicationBefore.trim() !== '' ||
      r.indicationAfter.trim() !== ''
  );
}

/**
 * Checks whether user has already entered readings in the Zero-Setting Accuracy module.
 */
export function hasZeroSettingReadings(zs: ZeroSettingFormState): boolean {
  return zs.load.trim() !== '' || zs.indicatedValue.trim() !== '' || zs.additionalLoad.trim() !== '';
}

