/**
 * @file types.ts
 * @description UI-local form-state shapes for the R76 evaluation screen.
 *
 * These types exist ONLY to back controlled form inputs (everything is kept
 * as a string while being edited). They are converted into the real
 * `@/lib/r76/types` / `@/lib/r76/engine` request shapes immediately before
 * the POST to /api/r76/evaluate. No regulatory logic lives here.
 */

import { AccuracyClass } from '@/lib/r76/types';
import type { LoadingDirection } from '@/lib/r76/types';

// ─── Instrument form state ─────────────────────────────────────────

export interface InstrumentFormState {
  id: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  accuracyClass: AccuracyClass;
  instrumentType: 'SINGLE_RANGE' | 'MULTI_RANGE' | 'MULTI_INTERVAL';
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

export function createWeighingRow(id: string): WeighingRowState {
  return {
    id,
    load: '',
    indicatedValue: '',
    additionalLoad: '0',
    zeroError: '0',
    loadingDirection: 'increasing',
  };
}

// ─── Repeatability form state ──────────────────────────────────────

export interface RepeatabilityFormState {
  testLoad: string;
  indications: string[];
  autoZeroOrTrackingActive: boolean;
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
 * for the selected accuracy class.
 *
 * The backend still independently validates the actual requirement.
 */
export function requiredIndicationCount(
  accuracyClass: AccuracyClass
): number {
  return accuracyClass === AccuracyClass.I ||
    accuracyClass === AccuracyClass.II
    ? 6
    : 3;
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
  id: string,
  positionId: string
): EccentricRowState {
  return {
    id,
    positionId,
    appliedLoad: '',
    indicatedValue: '',
    additionalLoad: '0',
    zeroError: '0',
    autoZeroOrTrackingDisabled: true,
  };
}

// ─── Shared helpers ─────────────────────────────────────────────────

/**
 * Parses a required form string into a finite number.
 * Throws instead of silently converting invalid/missing input to 0.
 */
export function parseNum(value: string): number {
  const trimmed = value.trim();

  if (trimmed === '') {
    throw new Error('Required numeric value is missing.');
  }

  const n = Number(trimmed);

  if (!Number.isFinite(n)) {
    throw new Error(`Invalid numeric value: "${value}"`);
  }

  return n;
}
