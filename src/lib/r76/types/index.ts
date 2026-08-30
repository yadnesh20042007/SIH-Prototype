/**
 * @file index.ts
 * @description Public API barrel for the R76 types module.
 *
 * Import all R76 types from this single entry point:
 *   import type { Instrument, AccuracyClass, R76Test, ... } from '@/lib/r76/types';
 *
 * Module layout:
 *   instrument.ts   — AccuracyClass, InstrumentType, Instrument
 *   verification.ts — VerificationContext
 *   observations.ts — LoadingDirection, *Observation types
 *   results.ts      — TestStatus, TestOutcome, *Result types
 *   test.ts         — TestType, *Test session types, R76Test union
 */

// ── Instrument ─────────────────────────────────────────────────────
export type { Instrument }                    from './instrument';
export      { AccuracyClass, InstrumentType } from './instrument';

// ── Verification ───────────────────────────────────────────────────
export { VerificationContext }                from './verification';

// ── Observations ───────────────────────────────────────────────────
export type { LoadingDirection }                    from './observations';
export type { WeighingPerformanceObservation }      from './observations';
export type { RepeatabilityObservation }            from './observations';
export type { EccentricLoadingObservation }         from './observations';

// ── Results ────────────────────────────────────────────────────────
export { TestStatus, TestOutcome }                  from './results';
export type { ObservationComplianceResult }         from './results';
export type { TestComplianceResult }                from './results';

// ── Test sessions ──────────────────────────────────────────────────
export      { TestType }                            from './test';
export type { WeighingPerformanceTest }             from './test';
export type { RepeatabilityTest }                   from './test';
export type { EccentricLoadingTest }                from './test';
export type { R76Test }                             from './test';
