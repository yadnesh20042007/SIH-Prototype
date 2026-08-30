/**
 * @file verification.ts
 * @description Verification context types for OIML R76 compliance testing.
 *
 * R76 distinguishes between three testing contexts that affect which
 * MPE multipliers apply. (R76-1 §3.8, §5.2)
 */

// ─── Verification Context ─────────────────────────────────────────

/**
 * The regulatory context in which a compliance test is performed.
 *
 * - Initial Verification: Performed on a new instrument before first use.
 *   MPE = 1× the tabulated limit. (R76-1 §3.8.1)
 *
 * - Subsequent Verification: Periodic re-verification during the instrument's
 *   service life. MPE = 2× the initial tabulated limit. (R76-1 §3.8.2)
 *
 * - Service Inspection: In-service inspection by an authority.
 *   MPE = 2× the initial tabulated limit. (R76-1 §3.8.3)
 */
export enum VerificationContext {
  InitialVerification    = 'initial_verification',
  SubsequentVerification = 'subsequent_verification',
  ServiceInspection      = 'service_inspection',
}
