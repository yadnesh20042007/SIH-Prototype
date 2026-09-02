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

// ─── Compliance Trace types ───────────────────────────────────────

/**
 * A pinned reference to a specific OIML R 76-1:2006 (E) clause, table,
 * or annex that was actually used by the engine rule producing this trace.
 *
 * Only references confirmed in the backend implementation are populated.
 * AI-inferred or speculative references are never added.
 */
export interface R76DocumentReference {
  /** Canonical document identifier. */
  document: 'OIML R 76-1:2006 (E)';
  /** Clause number, e.g. "3.5.1" or "3.6.2". Optional when not a clause ref. */
  clause?: string;
  /** Table identifier, e.g. "Table 6". */
  table?: string;
  /** Annex identifier, e.g. "Annex A.4.4.3" or "Annex A.4.7.1". */
  annex?: string;
  /** Short human-readable description of what this reference covers. */
  purpose: string;
}

/**
 * One step in the formula chain shown in the Compliance Trace.
 * Separates the abstract formula from its substituted form and result.
 */
export interface TraceCalculationStep {
  /** Display label for this step, e.g. "Indication before rounding (P)". */
  label: string;
  /** Abstract formula, e.g. "P = I + 0.5e − ΔL". */
  formula: string;
  /** Formula with actual numeric values substituted, e.g. "P = 5.000 + 0.5(0.010) − 0.004". */
  substitutedFormula: string;
  /** Numeric result of this step. */
  result: number;
  /** Physical unit of the result, e.g. "kg". */
  unit: string;
  /** Optional R76 reference specifically for this step (e.g. the annex that defines the formula). */
  reference?: R76DocumentReference;
}

/**
 * Structured breakdown of how the Maximum Permissible Error (MPE) was
 * selected from OIML R 76-1:2006 (E) Table 6 for a particular observation.
 *
 * All numerical values are in kg.
 */
export interface MPETraceDetail {
  /** Accuracy class of the instrument. */
  accuracyClass: string;
  /** Load used for MPE band selection, in kg. */
  load: number;
  /** Verification scale interval e, in kg. */
  e: number;
  /** Ratio load / e (dimensionless). */
  loadOverE: number;
  /** Human-readable description of the applicable Table 6 band, e.g. "500e < m ≤ 2000e". */
  tableBand: string;
  /** MPE factor expressed as a multiple of e, e.g. "1.0e". */
  mpeFactor: string;
  /** Base MPE = mpe_factor × e, in kg. */
  baseMPE: number;
  /** Verification context label, e.g. "Initial Verification". */
  verificationContext: string;
  /** Multiplier applied for the verification context (1 or 2). */
  contextMultiplier: number;
  /** Effective MPE = baseMPE × contextMultiplier, in kg. */
  effectiveMPE: number;
  /** R76 reference for the MPE table. */
  reference: R76DocumentReference;
}

/**
 * Complete, structured Compliance Trace for a single observation or test.
 *
 * Produced exclusively by the backend R76 calculation functions.
 * The frontend renders this data verbatim — no compliance logic is performed
 * in React components.
 */
export interface ComplianceTrace {
  /**
   * Instrument / evaluation context values relevant to this specific test.
   * Key-value pairs only — no derived or calculated values here.
   */
  instrumentContext: Record<string, string | number | boolean>;

  /** R76 references actually used by the engine rule for this observation. */
  references: R76DocumentReference[];

  /**
   * Raw observed inputs recorded by the inspector.
   * Key-value pairs matching the observation variables (L, I, ΔL, E0, etc.).
   */
  inputs: Record<string, string | number>;

  /** Ordered formula steps showing the full calculation chain. */
  calculationSteps: TraceCalculationStep[];

  /** How the applicable MPE was determined from Table 6. */
  mpeTrace: MPETraceDetail;

  /**
   * Final comparison statement, e.g. "|Ec| ≤ MPE" or "R ≤ MPE".
   * Presented as: comparisonFormula, leftValue OP rightValue.
   */
  comparison: {
    /** Abstract comparison formula, e.g. "|Ec| ≤ MPE". */
    formula: string;
    /** Substituted comparison, e.g. "|0.002 kg| ≤ 0.005 kg". */
    substituted: string;
    /** Whether the comparison passed (left ≤ right). */
    passed: boolean;
  };

  /** Regulatory outcome for this observation or test. */
  outcome: TestOutcome;
}
