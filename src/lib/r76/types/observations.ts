/**
 * @file observations.ts
 * @description Raw observation / measurement input types for each R76 test.
 *
 * These types represent the data recorded by the inspector during testing.
 * They are intentionally free of any derived or calculated fields — all
 * computation belongs in the calculations layer (src/lib/r76/calculations/).
 *
 * Relevant R76 clauses:
 *  - Weighing performance test: R76-2 §4.2
 *  - Repeatability test:        R76-2 §4.3
 *  - Eccentric loading test:    R76-2 §4.4
 */

// ─── Shared primitives ────────────────────────────────────────────

/**
 * Direction of load application during a weighing performance test.
 * R76-1 requires testing in both the increasing and decreasing direction.
 */
export type LoadingDirection = 'increasing' | 'decreasing';

// ─── Weighing Performance ─────────────────────────────────────────

/**
 * A single measurement point in a weighing performance test sequence.
 *
 * The calculated error E = I − L − ΔL (if ΔL is used) − E0 is NOT stored
 * here; it is produced by the calculations layer.
 *
 * Variables follow R76-2 §4.2 notation:
 *  - L  : applied (reference) load
 *  - I  : instrument indication
 *  - ΔL : additional substituted load (substitution method; omit if not used)
 *  - E0 : indication at zero before/after the test load
 */
export interface WeighingPerformanceObservation {
  /**
   * Sequence index within the test run (0-based).
   * Used to preserve ordering of increasing/decreasing load steps.
   */
  sequenceIndex: number;

  /** Applied reference load L in kg. (R76-2 §4.2) */
  load: number;

  /** Instrument indication I in kg at load L. */
  indicatedValue: number;

  /**
   * Additional substituted load ΔL in kg used in the substitution method.
   * Omit (or set to 0) when the direct loading method is used.
   * (R76-2 §4.2, substitution method)
   */
  additionalLoad?: number;

  /**
   * Zero error E0 in kg: the instrument indication at zero immediately
   * before or after the observation. (R76-2 §4.2)
   */
  zeroError: number;

  /** Direction of load application for this observation step. */
  loadingDirection: LoadingDirection;
}

// ─── Repeatability ────────────────────────────────────────────────

/**
 * All observations for a single repeatability test run.
 *
 * R76-2 §4.3: The same test load is applied repeatedly (typically ≥ 5 times)
 * without changing the instrument setup between repetitions.
 */
export interface RepeatabilityObservation {
  /** Test load applied for all repetitions, in kg. */
  testLoad: number;

  /**
   * Array of instrument indications from each repetition, in kg.
   * Must contain at least 2 values; R76-2 typically requires ≥ 5.
   * Stored in chronological order (first repetition at index 0).
   */
  indications: number[];

  /**
   * Confirms that the auto-zero / zero-tracking device was active
   * throughout the test, as required when the instrument is so equipped.
   * Must be true when Instrument.hasAutoZeroOrTracking is true.
   * (R76-2 §4.3, Note)
   */
  autoZeroOrTrackingActive: boolean;
}

// ─── Eccentric Loading ────────────────────────────────────────────

/**
 * A single observation at one load-receptor position during an eccentric
 * loading test.
 *
 * R76-2 §4.4: A test load (typically ⅓ of Max) is placed at each support
 * point and the central position. The inspector records the indication at
 * each position and the zero reading used to correct it.
 */
export interface EccentricLoadingObservation {
  /**
   * Human-readable position identifier (e.g. "centre", "front-left",
   * "position-1"). Must be unique within the test session.
   */
  positionId: string;

  /** Load applied at this position L in kg. */
  appliedLoad: number;

  /** Instrument indication I at this position in kg. */
  indicatedValue: number;

  /**
   * Additional substituted load ΔL in kg, if the substitution method
   * is used at this position. Omit when not applicable.
   */
  additionalLoad?: number;

  /**
   * Zero error E0 in kg: the zero indication used as the reference
   * for this specific position observation. (R76-2 §4.4)
   */
  zeroError: number;

  /**
   * Confirms that the auto-zero / zero-tracking device was disabled
   * during this position test, as required by R76-2 §4.4 to prevent
   * the device from masking eccentric loading errors.
   * Must be true when Instrument.hasAutoZeroOrTracking is true.
   */
  autoZeroOrTrackingDisabled: boolean;
}
