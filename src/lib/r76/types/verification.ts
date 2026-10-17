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
  TypeEvaluation         = 'type_evaluation',
  InitialVerification    = 'initial_verification',
  SubsequentVerification = 'subsequent_verification',
  ServiceInspection      = 'service_inspection',
}

/**
 * Normalizes any casing or representation of a verification context
 * into the canonical VerificationContext enum.
 *
 * Supported inputs:
 * - 'type_evaluation', 'TYPE_EVALUATION' -> VerificationContext.TypeEvaluation
 * - 'initial_verification', 'INITIAL_VERIFICATION' -> VerificationContext.InitialVerification
 * - 'subsequent_verification', 'SUBSEQUENT_VERIFICATION' -> VerificationContext.SubsequentVerification
 * - 'service_inspection', 'SERVICE_INSPECTION', 'in_service', 'IN_SERVICE' -> VerificationContext.ServiceInspection
 *
 * Throws on unknown or missing context to prevent silent misclassification.
 */
export function normalizeVerificationContext(
  context: string | VerificationContext | null | undefined
): VerificationContext {
  if (!context) {
    throw new Error('Verification context is required');
  }
  const norm = String(context).trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (norm) {
    case 'type_evaluation':
      return VerificationContext.TypeEvaluation;
    case 'initial_verification':
      return VerificationContext.InitialVerification;
    case 'subsequent_verification':
      return VerificationContext.SubsequentVerification;
    case 'service_inspection':
    case 'in_service':
      return VerificationContext.ServiceInspection;
    default:
      throw new Error(
        `Unsupported verification context: "${context}". Must be one of TYPE_EVALUATION, INITIAL_VERIFICATION, SUBSEQUENT_VERIFICATION, or SERVICE_INSPECTION.`
      );
  }
}

/**
 * Returns true if the context represents OIML R76 Type Evaluation (pattern approval).
 */
export function isTypeEvaluationContext(
  context: string | VerificationContext | null | undefined
): boolean {
  if (!context) return false;
  const norm = String(context).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return norm === 'type_evaluation';
}

/**
 * Returns the human-readable label for the verification context.
 */
export function getVerificationContextLabel(
  context: string | VerificationContext | null | undefined
): string {
  const normalized = normalizeVerificationContext(context);
  switch (normalized) {
    case VerificationContext.TypeEvaluation:
      return 'Type Evaluation';
    case VerificationContext.InitialVerification:
      return 'Initial Verification';
    case VerificationContext.SubsequentVerification:
      return 'Subsequent Verification';
    case VerificationContext.ServiceInspection:
      return 'Service Inspection';
  }
}

