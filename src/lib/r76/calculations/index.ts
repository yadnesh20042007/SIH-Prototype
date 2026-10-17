/**
 * @file index.ts
 * @description Public barrel for the R76 calculations module.
 *
 * Import calculation functions from this entry point:
 *   import { calculateMPE, evaluateWeighingPerformanceTest, … } from '@/lib/r76/calculations';
 *
 * All functions are pure and independently testable.
 * Every future test module (e.g. discrimination.ts) must be re-exported here.
 *
 * @module lib/r76/calculations
 */

// ── MPE ─────────────────────────────────────────────────────────────────────
export { calculateMPE }                              from './mpe';
export type { MPEResult }                            from './mpe';

// ── Weighing Performance ─────────────────────────────────────────────────────
export {
  evaluateWeighingObservation,
  evaluateWeighingPerformanceTest,
  checkWeighingCompleteness,
  getMPETransitionPoints,
  validateWeighingLoad,
  validateWeighingLoadInput,
  isWeighingObservationValid,
  fixFloat,
} from './weighing';
export type {
  WeighingPerformanceObservationResult,
  WeighingPerformanceTestResult,
  WeighingCompletenessResult,
  LoadValidationResult,
} from './weighing';

// ── Repeatability ────────────────────────────────────────────────────────────
export { evaluateRepeatabilityTest, normalizeRepeatabilitySeries, evaluateSingleRepeatabilitySeries } from './repeatability';
export type { RepeatabilityTestResult, RepeatabilitySeriesResult, RepeatabilityCompletenessResult } from './repeatability';

// ── Eccentric Loading ────────────────────────────────────────────────────────
export {
  evaluateEccentricPosition,
  evaluateEccentricLoadingTest,
  checkEccentricCompleteness,
  calculatePrescribedEccentricLoad,
  validateEccentricLoad,
  validateEccentricLoadInput,
  isEccentricObservationValid,
} from './eccentricity';
export type {
  EccentricityPositionResult,
  EccentricityTestResult,
  EccentricCompletenessResult,
  EccentricLoadValidationResult,
} from './eccentricity';

// ── Future test modules ──────────────────────────────────────────────────────
// Add each new test calculation file's exports here, e.g.:
export { evaluateDiscriminationTest } from './discrimination';
export type { DiscriminationTestResult } from './discrimination';

// ── Zero-Setting Accuracy ──────────────────────────────────────────────────
export { evaluateZeroSettingObservation, evaluateZeroSettingTest } from './zero-setting';
export type { ZeroSettingObservationResult, ZeroSettingAccuracyTestResult } from './zero-setting';

