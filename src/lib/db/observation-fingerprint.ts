import { createHash } from 'node:crypto';
import type { Instrument as PrismaInstrument } from '@prisma/client';

/** JSON key order is irrelevant; array order, primitive types and values are significant. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
    ).join(',')}}`;
  }
  throw new Error('Fingerprint input must be JSON');
}

export function observationFingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/**
 * Canonical SHA-256 fingerprint of the evaluation-relevant instrument configuration
 * plus the session's verificationContext.
 *
 * INCLUDED — every field whose value the R76 engine actually reads to select tests,
 * compute errors, or determine MPE:
 *   accuracyClass           — drives every MPE table lookup (Table 6) and repeatability
 *                             weighing-count requirement
 *   instrumentType          — controls test applicability (non-SINGLE_RANGE → not supported)
 *   max                     — used in compliance trace context; affects eccentric test load
 *   min                     — used in compliance trace context
 *   e                       — used directly in every error formula (P = I + 0.5e − ΔL)
 *                             and in calculateMPE(load, e)
 *   d                       — passed to engine as part of Instrument; in compliance trace
 *   numberOfSupportPoints   — controls eccentric loading applicability (>4 → not applicable)
 *   additiveTareEffect      — part of Instrument contract; affects test prerequisites
 *   hasAutoZeroOrTracking   — throws in repeatability + eccentricity when not set correctly;
 *                             affects which test prerequisites apply
 *   hasInitialZeroSettingDevice  — affects test selection prerequisites
 *   initialZeroSettingRange      — supplementary weighing-test prerequisite when > 0.20
 *   hasFineDisplayDevice    — part of Instrument contract; affects rounding logic
 *   verificationContext     — controls MPE multiplier (×1 initial, ×2 service/subsequent)
 *
 * EXCLUDED — display-only metadata that never enters calculations:
 *   manufacturer, model, serialNumber, manufacturerId, registeredById,
 *   id (instrument row PK, not a metrological value), createdAt, updatedAt
 *
 * Prisma Decimal values are serialized via .toString() which produces exact canonical
 * decimal strings (e.g. "0.001"), ensuring semantically-unchanged saves are stable.
 */
export interface InstrumentConfigSnapshot {
  accuracyClass: string;
  instrumentType: string;
  max: string;
  min: string;
  e: string;
  d: string;
  numberOfSupportPoints: number;
  additiveTareEffect: boolean;
  hasAutoZeroOrTracking: boolean;
  hasInitialZeroSettingDevice: boolean;
  initialZeroSettingRange: string;
  hasFineDisplayDevice: boolean;
  verificationContext: string;
}

export function instrumentConfigSnapshot(
  instrument: Pick<
    PrismaInstrument,
    | 'accuracyClass'
    | 'instrumentType'
    | 'max'
    | 'min'
    | 'e'
    | 'd'
    | 'numberOfSupportPoints'
    | 'additiveTareEffect'
    | 'hasAutoZeroOrTracking'
    | 'hasInitialZeroSettingDevice'
    | 'initialZeroSettingRange'
    | 'hasFineDisplayDevice'
  >,
  verificationContext: string
): InstrumentConfigSnapshot {
  return {
    accuracyClass: instrument.accuracyClass,
    instrumentType: instrument.instrumentType,
    max: instrument.max.toString(),
    min: instrument.min.toString(),
    e: instrument.e.toString(),
    d: instrument.d.toString(),
    numberOfSupportPoints: instrument.numberOfSupportPoints,
    additiveTareEffect: instrument.additiveTareEffect,
    hasAutoZeroOrTracking: instrument.hasAutoZeroOrTracking,
    hasInitialZeroSettingDevice: instrument.hasInitialZeroSettingDevice,
    initialZeroSettingRange: instrument.initialZeroSettingRange.toString(),
    hasFineDisplayDevice: instrument.hasFineDisplayDevice,
    verificationContext,
  };
}

export function instrumentConfigFingerprint(
  instrument: Pick<
    PrismaInstrument,
    | 'accuracyClass'
    | 'instrumentType'
    | 'max'
    | 'min'
    | 'e'
    | 'd'
    | 'numberOfSupportPoints'
    | 'additiveTareEffect'
    | 'hasAutoZeroOrTracking'
    | 'hasInitialZeroSettingDevice'
    | 'initialZeroSettingRange'
    | 'hasFineDisplayDevice'
  >,
  verificationContext: string
): string {
  return createHash('sha256')
    .update(canonicalJson(instrumentConfigSnapshot(instrument, verificationContext)))
    .digest('hex');
}

