/**
 * @file instrument.ts
 * @description TypeScript types describing a physical Non-Automatic Weighing
 * Instrument (NAWI) as characterised by OIML R76-1.
 *
 * Only single-range instruments are supported in this prototype.
 *
 * Relevant R76 clauses:
 *  - Accuracy classes: R76-1 §3.2, Table 1
 *  - Scale intervals (e, d): R76-1 §3.3 – §3.4
 *  - Minimum capacity (Min): R76-1 §4.4
 *  - Auto-zero / tracking: R76-1 §4.6
 *  - Initial zero setting: R76-1 §4.5
 *  - Fine display device: R76-1 §3.5
 */

// ─── Accuracy Class ───────────────────────────────────────────────

/**
 * OIML R76-1 accuracy classes for non-automatic weighing instruments.
 * Class I (special) through Class IIII (coarse).
 */
export enum AccuracyClass {
  /** Special accuracy — laboratory / analytical balances */
  I = 'I',
  /** High accuracy — trade, pharmacy */
  II = 'II',
  /** Medium accuracy — industrial, retail */
  III = 'III',
  /** Ordinary accuracy — coarse weighing */
  IIII = 'IIII',
}

// ─── Instrument Type ──────────────────────────────────────────────

/**
 * Weighing range type. Only single-range is supported in this prototype.
 * Multi-range and multi-interval (automatic changeover) may be added later.
 */
export enum InstrumentType {
  /** One continuous weighing range from Min to Max with a single e. */
  SingleRange = 'single_range',
}

// ─── Instrument Descriptor ────────────────────────────────────────

/**
 * Complete metrological and physical description of a NAWI submitted for
 * compliance testing. All mass/capacity values are in kilograms.
 *
 * This interface is the primary input to the R76 engine.
 * It must NOT contain any derived or calculated values — those belong in
 * the results layer.
 */
export interface Instrument {
  /** Unique identifier for this instrument record (UUID or equivalent). */
  id: string;

  /** Instrument manufacturer name. */
  manufacturer: string;

  /** Instrument model name / designation. */
  model: string;

  /** Serial number of the physical instrument (optional at registration). */
  serialNumber?: string;

  /** OIML accuracy class as approved / stated on the instrument. */
  accuracyClass: AccuracyClass;

  /**
   * Maximum capacity (Max) in kg.
   * The upper limit of the weighing range. (R76-1 §3.7)
   */
  max: number;

  /**
   * Minimum capacity (Min) in kg.
   * The smallest net load that can be weighed with the required accuracy.
   * (R76-1 §4.4, Table 4)
   */
  min: number;

  /**
   * Verification scale interval (e) in kg.
   * Used for MPE calculations and classification. (R76-1 §3.4)
   * Must satisfy: d ≤ e ≤ 10d
   */
  e: number;

  /**
   * Actual scale interval (d) in kg.
   * The value of the smallest indication step on the display. (R76-1 §3.3)
   */
  d: number;

  /**
   * Number of load-receptor support points.
   * Determines the number of eccentric loading test positions. (R76-1 §3.9.2)
   */
  numberOfSupportPoints: number;

  /**
   * Whether the instrument has an additive tare device.
   * When true, the tare effect is additive — the gross load is used for MPE
   * calculation rather than the net load. (R76-1 §4.3.2)
   */
  additiveTareEffect: boolean;

  /**
   * Whether the instrument is equipped with an auto-zero or zero-tracking
   * device. Affects how E0 (zero error) is handled in tests. (R76-1 §4.6)
   */
  hasAutoZeroOrTracking: boolean;

  /**
   * Whether the instrument has an initial zero-setting device. (R76-1 §4.5)
   */
  hasInitialZeroSettingDevice: boolean;

  /**
   * The range within which the initial zero-setting device operates,
   * expressed as a fraction of Max (e.g. 0.20 for 20 %).
   * Only meaningful when hasInitialZeroSettingDevice is true. (R76-1 §4.5)
   */
  initialZeroSettingRange: number;

  /**
   * Whether the instrument has a fine-indication (auxiliary) display device
   * with d_f < d. Affects rounding correction application. (R76-1 §3.5)
   */
  hasFineDisplayDevice: boolean;

  /** Weighing range type. Only 'single_range' is supported in this prototype. */
  instrumentType: InstrumentType;
}
