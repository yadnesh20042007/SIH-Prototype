import { AccuracyClass } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import type { MPETraceDetail } from '../types/results';

export interface MPEResult {
  baseMPE: number;
  effectiveMPE: number;
  reference: string;
  /** Structured breakdown of MPE selection for the Compliance Trace. */
  mpeTrace: MPETraceDetail;
}

/**
 * Calculates the Maximum Permissible Error (MPE) for a given load.
 * Based purely on OIML R76-1 (2006) Table 6.
 *
 * @param accuracyClass The accuracy class of the instrument
 * @param m The load in mass units
 * @param e The verification scale interval in mass units
 * @param context The verification context
 * @returns MPEResult containing base MPE, effective MPE, regulatory reference, and trace detail
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
  let tableBand: string;

  switch (accuracyClass) {
    case AccuracyClass.I:
      if (m_e >= 0 && m_e <= 50000) { mpe_e = 0.5; tableBand = '0 ≤ m ≤ 50 000e'; }
      else if (m_e > 50000 && m_e <= 200000) { mpe_e = 1.0; tableBand = '50 000e < m ≤ 200 000e'; }
      else { mpe_e = 1.5; tableBand = 'm > 200 000e'; }
      break;

    case AccuracyClass.II:
      if (m_e >= 0 && m_e <= 5000) { mpe_e = 0.5; tableBand = '0 ≤ m ≤ 5 000e'; }
      else if (m_e > 5000 && m_e <= 20000) { mpe_e = 1.0; tableBand = '5 000e < m ≤ 20 000e'; }
      else if (m_e > 20000 && m_e <= 100000) { mpe_e = 1.5; tableBand = '20 000e < m ≤ 100 000e'; }
      else throw new Error(`Load ${m_e}e exceeds Class II maximum of 100000e`);
      break;

    case AccuracyClass.III:
      if (m_e >= 0 && m_e <= 500) { mpe_e = 0.5; tableBand = '0 ≤ m ≤ 500e'; }
      else if (m_e > 500 && m_e <= 2000) { mpe_e = 1.0; tableBand = '500e < m ≤ 2 000e'; }
      else if (m_e > 2000 && m_e <= 10000) { mpe_e = 1.5; tableBand = '2 000e < m ≤ 10 000e'; }
      else throw new Error(`Load ${m_e}e exceeds Class III maximum of 10000e`);
      break;

    case AccuracyClass.IIII:
      if (m_e >= 0 && m_e <= 50) { mpe_e = 0.5; tableBand = '0 ≤ m ≤ 50e'; }
      else if (m_e > 50 && m_e <= 200) { mpe_e = 1.0; tableBand = '50e < m ≤ 200e'; }
      else if (m_e > 200 && m_e <= 1000) { mpe_e = 1.5; tableBand = '200e < m ≤ 1 000e'; }
      else throw new Error(`Load ${m_e}e exceeds Class IIII maximum of 1000e`);
      break;

    default:
      throw new Error(`Unsupported accuracy class: ${accuracyClass}`);
  }

  let multiplier = 1;
  let contextLabel: string;
  if (context === VerificationContext.InitialVerification) {
    multiplier = 1;
    contextLabel = 'Initial Verification';
  } else if (context === VerificationContext.SubsequentVerification) {
    multiplier = 1;
    contextLabel = 'Subsequent Verification';
  } else if (context === VerificationContext.ServiceInspection) {
    multiplier = 2;
    contextLabel = 'Service Inspection';
  } else {
    throw new Error(`Unsupported verification context: ${context}`);
  }

  const baseMPE = mpe_e * e;
  const effectiveMPE = baseMPE * multiplier;

  const mpeTrace: MPETraceDetail = {
    accuracyClass,
    load: m,
    e,
    loadOverE: m_e,
    tableBand,
    mpeFactor: `${mpe_e}e`,
    baseMPE,
    verificationContext: contextLabel,
    contextMultiplier: multiplier,
    effectiveMPE,
    reference: {
      document: 'OIML R 76-1:2006 (E)',
      clause: '3.5.1',
      table: 'Table 6',
      purpose: 'Maximum permissible errors on verification',
    },
  };

  return {
    baseMPE,
    effectiveMPE,
    reference: 'OIML R76-1 (2006), clause 3.5.1, Table 6, p.30',
    mpeTrace,
  };
}
