import { DiscriminationObservationPoint } from '../types/observations';
import { TestComplianceResult, TestOutcome, ObservationComplianceResult } from '../types/results';
import type { ComplianceTrace } from '../types/results';
import { Instrument } from '../types/instrument';
import { VerificationContext, isTypeEvaluationContext } from '../types/verification';

export interface DiscriminationTestResult extends TestComplianceResult {
  observationResults: DiscriminationObservationResult[];
  traces: ComplianceTrace[];
}

export interface DiscriminationObservationResult extends ObservationComplianceResult {
  trace: ComplianceTrace;
}

/**
 * Fixes typical JavaScript floating point inaccuracies for display and comparison.
 */
function fixFloat(val: number): number {
  return Math.round(val * 1e8) / 1e8;
}

export function evaluateDiscriminationObservation(
  obs: DiscriminationObservationPoint,
  instrument: Instrument,
  context: VerificationContext | string
): DiscriminationObservationResult {
  // 1. Validate applicability per OIML R76-1:2006 clause 3.8.2.2
  if (!isTypeEvaluationContext(context)) {
    throw new Error(`Digital discrimination test applies to Type Evaluation only per OIML R76-1 clause 3.8.2.2. Context provided: ${context}.`);
  }
  if (!Number.isFinite(instrument.d) || instrument.d <= 0) {
    throw new Error('Invalid actual scale interval (d): must be a positive finite number.');
  }
  if (instrument.d < 0.000005) {
    throw new Error('Discrimination test for digital indication requires d >= 5 mg (0.000005 kg) per OIML R76-1 clause 3.8.2.2.');
  }

  // 2. Validate observation inputs completeness
  if (!obs || typeof obs !== 'object') {
    throw new Error('Missing discrimination observation point.');
  }
  if (!Number.isFinite(obs.testLoad) || obs.testLoad < 0) {
    throw new Error('Invalid testLoad: must be a non-negative finite number.');
  }
  if (!Number.isFinite(obs.indicationBefore) || obs.indicationBefore < 0) {
    throw new Error('Invalid indicationBefore: must be a non-negative finite number.');
  }
  if (!Number.isFinite(obs.indicationAfter) || obs.indicationAfter < 0) {
    throw new Error('Invalid indicationAfter: must be a non-negative finite number.');
  }

  const L = obs.testLoad;
  const I = obs.indicationBefore;
  const I_after = obs.indicationAfter;
  const d = instrument.d;

  const expectedI_after = fixFloat(I + d);
  const deltaI = fixFloat(I_after - I);
  const minRequiredChange = fixFloat(d);

  // OIML R76-1:2006 Annex A.4.8.2: Indication shall change by at least one actual scale interval (I_after >= I + d)
  const isPass = fixFloat(deltaI - minRequiredChange) >= -1e-9;
  const outcome = isPass ? TestOutcome.Pass : TestOutcome.Fail;

  const trace: ComplianceTrace = {
    instrumentContext: {
      'Accuracy Class': instrument.accuracyClass,
      'Max (kg)': instrument.max,
      'Min (kg)': instrument.min,
      'e (kg)': instrument.e,
      'd (kg)': d,
      'Verification Context': context,
    },
    references: [
      {
        document: 'OIML R 76-1:2006 (E)',
        clause: '3.8',
        purpose: 'Discrimination general requirement',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        clause: '3.8.2.2',
        purpose: 'Digital indication discrimination threshold (1.4d)',
      },
      {
        document: 'OIML R 76-1:2006 (E)',
        annex: 'Annex A.4.8.2',
        purpose: 'Discrimination test procedure (digital indication)',
      }
    ],
    inputs: {
      'L — Applied load (kg)': L,
      'I — Indication before 1.4d (kg)': I,
      'I_after — Indication after 1.4d (kg)': I_after,
      'd — Actual scale interval (kg)': d,
    },
    calculationSteps: [
      {
        label: 'Minimum required indication (I + d)',
        formula: 'I_min = I + d',
        substitutedFormula: `I_min = ${I} + ${d}`,
        result: expectedI_after,
        unit: 'kg',
      },
      {
        label: 'Observed indication change (ΔI)',
        formula: 'ΔI = I_after − I',
        substitutedFormula: `ΔI = ${I_after} − ${I}`,
        result: deltaI,
        unit: 'kg',
      }
    ],
    mpeTrace: {
      accuracyClass: instrument.accuracyClass,
      load: L,
      e: instrument.e,
      loadOverE: L / instrument.e,
      tableBand: 'N/A (Discrimination)',
      mpeFactor: '0',
      baseMPE: 0,
      verificationContext: context,
      contextMultiplier: 1,
      effectiveMPE: 0,
      reference: {
        document: 'OIML R 76-1:2006 (E)',
        clause: '3.8',
        purpose: 'MPE is not directly used for discrimination pass/fail'
      }
    },
    comparison: {
      formula: 'I_after ≥ I + d (ΔI ≥ d)',
      substituted: `${I_after} kg ≥ ${expectedI_after} kg (ΔI = ${deltaI} kg ≥ ${minRequiredChange} kg)`,
      passed: isPass,
    },
    outcome,
  };

  return {
    calculatedError: fixFloat(I_after - expectedI_after),
    mpe: 0, // Discrimination does not use MPE directly in its pass/fail formula
    outcome,
    r76Reference: 'R76-1 (2006) clause 3.8.2.2, A.4.8.2',
    explanation: `Load L=${L}, I=${I}, after 1.4d extra load I_after=${I_after} (ΔI=${deltaI}). Minimum required indication is I+d=${expectedI_after} (ΔI >= ${minRequiredChange}). ${isPass ? 'PASSED' : 'FAILED'}.`,
    trace,
  };
}

/**
 * Evaluates a discrimination test per R76-1 (2006) clause 3.8.
 */
export function evaluateDiscriminationTest(
  observations: DiscriminationObservationPoint[],
  instrument: Instrument,
  context: VerificationContext
): DiscriminationTestResult {
  if (!observations || observations.length === 0) {
    throw new Error('No observations provided for discrimination test.');
  }

  const observationResults = observations.map(obs => evaluateDiscriminationObservation(obs, instrument, context));
  
  const allPass = observationResults.every(r => r.outcome === TestOutcome.Pass);
  const outcome = allPass ? TestOutcome.Pass : TestOutcome.Fail;
  
  let maxAbsoluteError = 0;
  for (const r of observationResults) {
    const absError = Math.abs(r.calculatedError);
    if (absError > maxAbsoluteError) {
      maxAbsoluteError = absError;
    }
  }

  return {
    outcome,
    maxAbsoluteError,
    observationResults,
    traces: observationResults.map(r => r.trace),
    r76Reference: 'R76-1 (2006) clause 3.8, A.4.8',
    explanation: `Discrimination test ${allPass ? 'PASSED' : 'FAILED'} with max error ${maxAbsoluteError}.`
  };
}
