/**
 * @file types.ts
 * @description UI-local form-state shapes for the R76 evaluation screen.
 *
 * These types exist ONLY to back controlled form inputs (everything is kept
 * as a string while being edited). They are converted into the real
 * `@/lib/r76/types` / `@/lib/r76/engine` request shapes immediately before
 * the POST to /api/r76/evaluate. No regulatory logic lives here.
 */

import {
  AccuracyClass,
  VerificationContext,
  normalizeVerificationContext,
  isTypeEvaluationContext,
  getVerificationContextLabel,
} from '@/lib/r76/types';
import type { LoadingDirection } from '@/lib/r76/types';

export {
  normalizeVerificationContext,
  isTypeEvaluationContext,
  getVerificationContextLabel,
};

// ─── Instrument form state ─────────────────────────────────────────

export interface InstrumentFormState {
  id: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  accuracyClass: AccuracyClass;
  instrumentType: 'SINGLE_RANGE' | 'MULTI_RANGE' | 'MULTI_INTERVAL';
  indicationType?: 'DIGITAL' | 'ANALOG' | 'digital' | 'analog' | null;
  zeroSettingMechanisms: string[];
  max: string;
  min: string;
  e: string;
  d: string;
  numberOfSupportPoints: string;
  additiveTareEffect: boolean;
  hasAutoZeroOrTracking: boolean;
  hasInitialZeroSettingDevice: boolean;
  initialZeroSettingRange: string;
  hasFineDisplayDevice: boolean;
}

export function createDefaultInstrument(): InstrumentFormState {
  return {
    id: 'inst-draft-001',
    manufacturer: '',
    model: '',
    serialNumber: '',
    accuracyClass: AccuracyClass.III,
    instrumentType: 'SINGLE_RANGE',
    indicationType: 'DIGITAL',
    zeroSettingMechanisms: [],
    max: '',
    min: '',
    e: '',
    d: '',
    numberOfSupportPoints: '4',
    additiveTareEffect: false,
    hasAutoZeroOrTracking: true,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: '0',
    hasFineDisplayDevice: false,
  };
}

// ─── Weighing performance form state ───────────────────────────────

export interface WeighingRowState {
  id: string;
  load: string;
  indicatedValue: string;
  additionalLoad: string;
  zeroError: string;
  loadingDirection: LoadingDirection;
}

let globalRowCounter = 0;

export function generateRowId(prefix: string): string {
  globalRowCounter += 1;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${globalRowCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createWeighingRow(id?: string): WeighingRowState {
  return {
    id: id || generateRowId('w'),
    load: '',
    indicatedValue: '',
    additionalLoad: '0',
    zeroError: '0',
    loadingDirection: 'increasing',
  };
}

// ─── Repeatability form state ──────────────────────────────────────

export interface RepeatabilitySeriesFormState {
  seriesNumber: number;
  testLoad: string;
  indications: string[];
}

export interface RepeatabilityFormState {
  testLoad: string;
  indications: string[];
  autoZeroOrTrackingActive: boolean;
  series?: RepeatabilitySeriesFormState[];
}

export function createDefaultRepeatability(): RepeatabilityFormState {
  return {
    testLoad: '',
    indications: ['', '', ''],
    autoZeroOrTrackingActive: true,
  };
}

/**
 * Number of repeated indication inputs shown in the UI
 * for the selected accuracy class, context, and Max.
 */
export function requiredRepeatabilityWeighingsCount(
  accuracyClass: AccuracyClass,
  context?: VerificationContext | string,
  max?: number
): number {
  if (isTypeEvaluationContext(context)) {
    return (max !== undefined && max >= 1000) ? 3 : 10;
  }
  return accuracyClass === AccuracyClass.I ||
    accuracyClass === AccuracyClass.II
    ? 6
    : 3;
}

/**
 * Number of repeated indication inputs shown in the UI
 * for the selected accuracy class (backward-compatible signature).
 */
export function requiredIndicationCount(
  accuracyClass: AccuracyClass
): number {
  return requiredRepeatabilityWeighingsCount(accuracyClass);
}

/** Resizes an indications array to `count`, preserving existing values. */
export function resizeIndications(
  current: string[],
  count: number
): string[] {
  if (current.length === count) return current;
  if (current.length > count) return current.slice(0, count);

  return [
    ...current,
    ...Array.from({ length: count - current.length }, () => ''),
  ];
}

// ─── Eccentric loading form state ──────────────────────────────────

export interface EccentricRowState {
  id: string;
  positionId: string;
  appliedLoad: string;
  indicatedValue: string;
  additionalLoad: string;
  zeroError: string;
  autoZeroOrTrackingDisabled: boolean;
}

export function createEccentricRow(
  id?: string,
  positionId = '1'
): EccentricRowState {
  return {
    id: id || generateRowId('e'),
    positionId,
    appliedLoad: '',
    indicatedValue: '',
    additionalLoad: '0',
    zeroError: '0',
    autoZeroOrTrackingDisabled: true,
  };
}

// ─── Discrimination form state ─────────────────────────────────────

export interface DiscriminationRowState {
  id: string;
  testLoad: string;
  indicationBefore: string;
  indicationAfter: string;
}

export function createDiscriminationRow(id?: string, testLoad = ''): DiscriminationRowState {
  return {
    id: id || generateRowId('d'),
    testLoad,
    indicationBefore: '',
    indicationAfter: '',
  };
}

// ─── Zero-Setting Accuracy form state ──────────────────────────────

export interface ZeroSettingFormState {
  load: string;
  indicatedValue: string;
  additionalLoad: string;
}

export function createDefaultZeroSetting(): ZeroSettingFormState {
  return {
    load: '',
    indicatedValue: '',
    additionalLoad: '',
  };
}

// ─── Shared helpers ─────────────────────────────────────────────────

/**
 * Parses a required form string into a finite number.
 * Throws instead of silently converting invalid/missing input to 0.
 */
export function parseNum(
  value: string | number | undefined | null,
  fieldName?: string
): number {
  if (value === undefined || value === null) {
    throw new Error(
      fieldName ? `${fieldName} is required.` : 'Required numeric value is missing.'
    );
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        fieldName
          ? `${fieldName} must be a valid number: "${value}".`
          : `Invalid numeric value: "${value}".`
      );
    }
    return value;
  }

  const trimmed = String(value).trim();

  if (trimmed === '') {
    throw new Error(
      fieldName ? `${fieldName} is required.` : 'Required numeric value is missing.'
    );
  }

  const n = Number(trimmed);

  if (!Number.isFinite(n)) {
    throw new Error(
      fieldName
        ? `${fieldName} must be a valid number: "${value}".`
        : `Invalid numeric value: "${value}".`
    );
  }

  return n;
}
