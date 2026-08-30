import { AccuracyClass } from '../types/instrument';
import { VerificationContext } from '../types/verification';

export interface MPEResult {
  baseMPE: number;
  effectiveMPE: number;
  reference: string;
}

/**
 * Calculates the Maximum Permissible Error (MPE) for a given load.
 * Based purely on OIML R76-1 (2006) Table 6.
 *
 * @param accuracyClass The accuracy class of the instrument
 * @param m The load in mass units
 * @param e The verification scale interval in mass units
 * @param context The verification context
 * @returns MPEResult containing base MPE, effective MPE, and regulatory reference
 */
export function calculateMPE(
  accuracyClass: AccuracyClass,
  m: number,
  e: number,
  context: VerificationContext
): MPEResult {
  if (e <= 0) {
    throw new Error('Verification scale interval (e) must be greater than 0');
  }
  if (m < 0) {
    throw new Error('Load (m) cannot be negative');
  }

  const m_e = m / e;
  let mpe_e: number;

  switch (accuracyClass) {
    case AccuracyClass.I:
      if (m_e >= 0 && m_e <= 50000) mpe_e = 0.5;
      else if (m_e > 50000 && m_e <= 200000) mpe_e = 1.0;
      else mpe_e = 1.5; // m > 200,000e
      break;

    case AccuracyClass.II:
      if (m_e >= 0 && m_e <= 5000) mpe_e = 0.5;
      else if (m_e > 5000 && m_e <= 20000) mpe_e = 1.0;
      else if (m_e > 20000 && m_e <= 100000) mpe_e = 1.5;
      else throw new Error(`Load ${m_e}e exceeds Class II maximum of 100000e`);
      break;

    case AccuracyClass.III:
      if (m_e >= 0 && m_e <= 500) mpe_e = 0.5;
      else if (m_e > 500 && m_e <= 2000) mpe_e = 1.0;
      else if (m_e > 2000 && m_e <= 10000) mpe_e = 1.5;
      else throw new Error(`Load ${m_e}e exceeds Class III maximum of 10000e`);
      break;

    case AccuracyClass.IIII:
      if (m_e >= 0 && m_e <= 50) mpe_e = 0.5;
      else if (m_e > 50 && m_e <= 200) mpe_e = 1.0;
      else if (m_e > 200 && m_e <= 1000) mpe_e = 1.5;
      else throw new Error(`Load ${m_e}e exceeds Class IIII maximum of 1000e`);
      break;

    default:
      throw new Error(`Unsupported accuracy class: ${accuracyClass}`);
  }

  let multiplier = 1;
  if (context === VerificationContext.InitialVerification) {
    multiplier = 1;
  } else if (context === VerificationContext.SubsequentVerification) {
    multiplier = 1;
  } else if (context === VerificationContext.ServiceInspection) {
    multiplier = 2;
  } else {
    throw new Error(`Unsupported verification context: ${context}`);
  }

  const baseMPE = mpe_e * e;
  const effectiveMPE = baseMPE * multiplier;

  return {
    baseMPE,
    effectiveMPE,
    reference: 'OIML R76-1 (2006), clause 3.5.1, Table 6, p.30',
  };
}
