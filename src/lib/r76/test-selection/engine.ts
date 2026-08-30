import { Instrument, InstrumentType } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { TestType } from '../types/test';

export interface TestSelectionResult {
  testType: TestType;
  isApplicable: boolean;
  reason: string;
  r76Reference: string;
  prerequisites: string[];
}

/**
 * Automatically determines which OIML R76 tests apply to the given instrument
 * and verification context based on the current prototype's supported scope.
 *
 * @param instrument The instrument data model to evaluate
 * @param context The verification context
 * @returns Array of test selection results explaining applicability and prerequisites
 */
export function selectTests(
  instrument: Instrument,
  context: VerificationContext
): TestSelectionResult[] {
  const results: TestSelectionResult[] = [];

  const isSingleRange = instrument.instrumentType === InstrumentType.SingleRange;

  // 1. Weighing Performance
  if (!isSingleRange) {
    results.push({
      testType: TestType.WeighingPerformance,
      isApplicable: false,
      reason: 'Unsupported: Only single-range instruments are currently supported by the prototype. Multi-interval or multiple-range instruments require manual review.',
      r76Reference: 'OIML R76-1 clause A.4.1.11, 3.3.3',
      prerequisites: []
    });
  } else {
    const prerequisites = [
      'Pre-load the instrument once to Max (or Lim) before the test (A.4.1.10).'
    ];
    if (instrument.hasInitialZeroSettingDevice && instrument.initialZeroSettingRange > 0.20) {
      prerequisites.push('Supplementary weighing test required: initial zero-setting range > 20% of Max (A.4.4.2).');
    }
    
    results.push({
      testType: TestType.WeighingPerformance,
      isApplicable: true,
      reason: 'Applies to every instrument regardless of accuracy class.',
      r76Reference: 'OIML R76-1 clause 3.5.1, Table 6, A.4.4.1',
      prerequisites
    });
  }

  // 2. Repeatability
  if (!isSingleRange) {
    results.push({
      testType: TestType.Repeatability,
      isApplicable: false,
      reason: 'Unsupported: Only single-range instruments are currently supported by the prototype.',
      r76Reference: 'OIML R76-1 clause A.4.1.11',
      prerequisites: []
    });
  } else {
    const prerequisites = [
      'Test load should be approximately 0.8 × Max for verification testing (A.4.10, 3rd paragraph).'
    ];
    if (instrument.hasAutoZeroOrTracking) {
      prerequisites.push('Automatic zero-setting or zero-tracking shall be in operation during this test (A.4.10).');
    }
    
    results.push({
      testType: TestType.Repeatability,
      isApplicable: true,
      reason: 'Required repeatability test for all instruments.',
      r76Reference: 'OIML R76-1 clause 3.6.1, A.4.10',
      prerequisites
    });
  }

  // 3. Eccentric Loading
  if (!isSingleRange) {
    results.push({
      testType: TestType.EccentricLoading,
      isApplicable: false,
      reason: 'Unsupported: Only single-range instruments are currently supported by the prototype.',
      r76Reference: 'OIML R76-1 clause A.4.1.11',
      prerequisites: []
    });
  } else if (instrument.numberOfSupportPoints > 4) {
    results.push({
      testType: TestType.EccentricLoading,
      isApplicable: false,
      reason: 'Unsupported: Eccentric loading for instruments with > 4 support points (A.4.7.2) is not currently supported by the prototype.',
      r76Reference: 'OIML R76-1 clause 3.6.2.2, A.4.7.2',
      prerequisites: []
    });
  } else {
    const prerequisites = [
      'Manual Review Required: This selection assumes a standard stationary load receptor. Mobile, rolling-load, or special receptors are unsupported and must be evaluated manually.',
      'Test load should be 1/3 × (Max + maximum additive tare effect) applied to each quarter segment (A.4.7.1).'
    ];
    if (instrument.hasAutoZeroOrTracking) {
      prerequisites.push('Automatic zero-setting/zero-tracking must NOT be in operation during this test (A.4.7).');
    }
    
    results.push({
      testType: TestType.EccentricLoading,
      isApplicable: true,
      reason: 'Applies to standard-platform instruments with ≤ 4 support points.',
      r76Reference: 'OIML R76-1 clause 3.6.2.1, A.4.7.1',
      prerequisites
    });
  }

  return results;
}
