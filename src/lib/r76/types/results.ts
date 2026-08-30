/**
 * @file results.ts
 * @description Explainable compliance result types for individual R76 test
 * observations and overall test sessions.
 *
 * Results are produced exclusively by the calculations layer
 * (src/lib/r76/calculations/). They are never constructed inside UI components.
 */

// ─── Outcome enums ────────────────────────────────────────────────

/**
 * The lifecycle status of a test — tracks progress, not regulatory outcome.
 */
export enum TestStatus {
  /** Test has been queued but no observations have been recorded. */
  Pending    = 'pending',
  /** Observations are being recorded; test is not yet complete. */
  InProgress = 'in_progress',
  /** All required observations have been recorded and evaluated. */
  Completed  = 'completed',
}

/**
 * The regulatory outcome of a completed compliance test or observation.
 */
export enum TestOutcome {
  /** All criteria satisfied within permissible limits. */
  Pass           = 'pass',
  /** One or more criteria exceeded permissible limits. */
  Fail           = 'fail',
  /**
   * Result is borderline (within one scale interval of the limit).
   * The test should be repeated before a formal FAIL is issued.
   * (R76-1 §5.2, Note)
   */
  RequiresRetest = 'requires_retest',
}

// ─── Observation-level result ─────────────────────────────────────

/**
 * The compliance evaluation of a single observation within a test.
 *
 * The calculations layer populates this after evaluating an individual
 * measurement point against the applicable MPE.
 *
 * All values in kg unless otherwise noted.
 */
export interface ObservationComplianceResult {
  /**
   * Calculated indication error in kg.
   * For weighing performance: E = I − L − ΔL − E0
   * For eccentric loading:    E = I − L − ΔL − E0  (at that position)
   */
  calculatedError: number;

  /**
   * Maximum Permissible Error (MPE) applicable to this observation in kg.
   * Sign-less magnitude; the permissible band is [−mpe, +mpe].
   * (R76-1 §3.8, Table 2/3)
   */
  mpe: number;

  /** Regulatory outcome for this observation. */
  outcome: TestOutcome;

  /**
   * OIML R76 clause or table reference that determined the MPE and outcome.
   * Format examples: "R76-1 Table 2", "R76-1 §4.3.2", "R76-2 §4.4"
   */
  r76Reference: string;

  /**
   * Human-readable explanation of the outcome, suitable for display in a
   * compliance report. Should state the error, the MPE, and the conclusion.
   *
   * Example:
   *   "Calculated error +0.004 kg; MPE ±0.005 kg (R76-1 Table 2, Class III,
   *    50 e ≤ L ≤ 200 e) — PASS."
   */
  explanation: string;
}

// ─── Test-level result ────────────────────────────────────────────

/**
 * The overall compliance result for a complete test (e.g. full weighing
 * performance sequence or repeatability run).
 *
 * Aggregates all observation-level results and provides a single top-level
 * outcome for the test.
 */
export interface TestComplianceResult {
  /** Aggregated outcome across all observations in the test. */
  outcome: TestOutcome;

  /**
   * The maximum absolute calculated error observed across all
   * measurement points in the test, in kg.
   */
  maxAbsoluteError: number;

  /** Individual evaluation for each observation in the test. */
  observationResults: ObservationComplianceResult[];

  /**
   * For repeatability: the range (max − min) of repeated indications in kg.
   * Undefined for non-repeatability tests.
   */
  repeatabilityRange?: number;

  /**
   * Primary R76 clause reference for the test as a whole.
   * Example: "R76-2 §4.2" for a weighing performance test.
   */
  r76Reference: string;

  /**
   * Human-readable summary of the overall test result.
   */
  explanation: string;
}
