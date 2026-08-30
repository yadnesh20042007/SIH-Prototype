/**
 * @file test.ts
 * @description Test record types that bind an instrument, a verification
 * context, observations, and optional compliance results together into a
 * single session object for each R76 test type.
 *
 * Tests are first-class records. Observations are attached as they are
 * recorded; results are attached after the calculations layer has run.
 *
 * Supported tests in this prototype:
 *  - Weighing Performance (R76-2 §4.2)
 *  - Repeatability        (R76-2 §4.3)
 *  - Eccentric Loading    (R76-2 §4.4)
 */

import type { Instrument }                            from './instrument';
import type { VerificationContext }                   from './verification';
import type {
  WeighingPerformanceObservation,
  RepeatabilityObservation,
  EccentricLoadingObservation,
} from './observations';
import type { TestStatus, TestComplianceResult }      from './results';

// ─── Test Type enum ───────────────────────────────────────────────

/**
 * Identifies which R76 test procedure a test record belongs to.
 */
export enum TestType {
  WeighingPerformance = 'weighing_performance',
  Repeatability       = 'repeatability',
  EccentricLoading    = 'eccentric_loading',
}

// ─── Base test session ────────────────────────────────────────────

/**
 * Fields common to every test session, regardless of test type.
 */
interface BaseTestSession {
  /** Unique identifier for this test session (UUID or equivalent). */
  id: string;

  /** Snapshot of the instrument under test at the time of the session. */
  instrument: Instrument;

  /** Regulatory context that determines the applicable MPE multiplier. */
  verificationContext: VerificationContext;

  /** ISO 8601 timestamp when the test session was created. */
  createdAt: string;

  /** ISO 8601 timestamp of the last observation or status update. */
  updatedAt: string;

  /** Lifecycle status of the test session. */
  status: TestStatus;

  /**
   * Name or identifier of the inspector conducting the test.
   * Optional at creation; required before a session can be marked Completed.
   */
  inspectorId?: string;

  /**
   * Free-text notes recorded by the inspector during the session.
   * Not used in compliance calculations.
   */
  notes?: string;
}

// ─── Weighing Performance Test ────────────────────────────────────

/**
 * A complete weighing performance test session. (R76-2 §4.2)
 *
 * Observations cover the full load range in both increasing and decreasing
 * directions (or increasing only, where permitted).
 */
export interface WeighingPerformanceTest extends BaseTestSession {
  type: TestType.WeighingPerformance;

  /** Ordered sequence of observation points recorded during the test. */
  observations: WeighingPerformanceObservation[];

  /**
   * Compliance result populated by the calculations layer after all
   * observations have been recorded. Undefined while status ≠ Completed.
   */
  result?: TestComplianceResult;
}

// ─── Repeatability Test ───────────────────────────────────────────

/**
 * A repeatability test session. (R76-2 §4.3)
 *
 * A single test load is applied repeatedly and the spread of indications
 * is compared to the applicable MPE.
 */
export interface RepeatabilityTest extends BaseTestSession {
  type: TestType.Repeatability;

  /**
   * The repeatability observation (one test load, multiple indications).
   * Undefined until the inspector has submitted the observation set.
   */
  observation?: RepeatabilityObservation;

  /** Compliance result, populated after the observation is complete. */
  result?: TestComplianceResult;
}

// ─── Eccentric Loading Test ───────────────────────────────────────

/**
 * An eccentric loading test session. (R76-2 §4.4)
 *
 * One observation per load-receptor support position plus the central
 * position. The number of observations equals numberOfSupportPoints + 1
 * (centre) for typical 3- or 4-support instruments.
 */
export interface EccentricLoadingTest extends BaseTestSession {
  type: TestType.EccentricLoading;

  /**
   * One observation per tested position.
   * Order is not mandated by R76 but must be consistent within the session.
   */
  observations: EccentricLoadingObservation[];

  /** Compliance result, populated after all positions have been tested. */
  result?: TestComplianceResult;
}

// ─── Union type ───────────────────────────────────────────────────

/**
 * Discriminated union over all supported R76 test session types.
 * The `type` field acts as the discriminant.
 *
 * @example
 * function handleTest(test: R76Test) {
 *   switch (test.type) {
 *     case TestType.WeighingPerformance: ...
 *     case TestType.Repeatability:       ...
 *     case TestType.EccentricLoading:    ...
 *   }
 * }
 */
export type R76Test =
  | WeighingPerformanceTest
  | RepeatabilityTest
  | EccentricLoadingTest;
