import type { EvaluatedTest } from '@/lib/r76/engine';
import type { EccentricityTestResult } from '@/lib/r76/calculations/eccentricity';
import type { RepeatabilityTestResult } from '@/lib/r76/calculations/repeatability';
import type { WeighingPerformanceTestResult } from '@/lib/r76/calculations/weighing';
import type { DiscriminationTestResult } from '@/lib/r76/calculations/discrimination';
import { TestOutcome, TestType, type ComplianceTrace } from '@/lib/r76/types';
import type {
  EccentricRowState,
  RepeatabilityFormState,
  WeighingRowState,
  DiscriminationRowState,
} from './types';

export type StoredTestType =
  | 'WEIGHING_PERFORMANCE'
  | 'REPEATABILITY'
  | 'ECCENTRIC_LOADING'
  | 'DISCRIMINATION'
  | 'ZERO_SETTING_ACCURACY';
export type StoredTestOutcome = 'PASS' | 'FAIL' | 'REQUIRES_RETEST';

export interface TestResultPersistenceData {
  testType: StoredTestType;
  outcome: StoredTestOutcome;
  maxAbsoluteError: string;
  mpe: string;
  repeatabilityRange?: string;
  r76Reference: string;
  explanation: string;
  complianceTrace: ComplianceTrace;
}

export interface SavedTestResultResponse
  extends Omit<TestResultPersistenceData, 'repeatabilityRange'> {
  id: string;
  sessionId: string;
  rulesetVersionId: string;
  repeatabilityRange: string | null;
  createdAt: string;
  evaluatedObservationFingerprint?: string | null;
}

export const STORED_TYPE_BY_ENGINE_TYPE: Record<TestType, StoredTestType> = {
  [TestType.WeighingPerformance]: 'WEIGHING_PERFORMANCE',
  [TestType.Repeatability]: 'REPEATABILITY',
  [TestType.EccentricLoading]: 'ECCENTRIC_LOADING',
  [TestType.Discrimination]: 'DISCRIMINATION',
  [TestType.ZeroSettingAccuracy]: 'ZERO_SETTING_ACCURACY',
};

const STORED_OUTCOME_BY_ENGINE_OUTCOME: Partial<Record<TestOutcome, StoredTestOutcome>> = {
  [TestOutcome.Pass]: 'PASS',
  [TestOutcome.Fail]: 'FAIL',
  [TestOutcome.RequiresRetest]: 'REQUIRES_RETEST',
};

function decisiveObservation<T extends { outcome: TestOutcome }>(
  observations: T[],
  outcome: TestOutcome
): T {
  const observation = observations.find((item) => item.outcome === outcome) ?? observations[0];
  if (!observation) throw new Error('The engine result did not include a persistable Compliance Trace.');
  return observation;
}

/** Maps only values already produced by the R76 engine into the persistence contract. */
export function toTestResultPersistenceData(test: EvaluatedTest): TestResultPersistenceData | null {
  if (!test.result) return null;
  const outcome = STORED_OUTCOME_BY_ENGINE_OUTCOME[test.result.outcome];
  if (!outcome) return null;

  const base = {
    testType: STORED_TYPE_BY_ENGINE_TYPE[test.testType],
    outcome,
    maxAbsoluteError: String(test.result.maxAbsoluteError),
    r76Reference: test.result.r76Reference,
    explanation: test.result.explanation,
  };

  if (test.testType === TestType.Repeatability) {
    const result = test.result as RepeatabilityTestResult;
    return {
      ...base,
      mpe: String(result.mpe),
      repeatabilityRange: String(result.repeatabilityRange),
      complianceTrace: result.trace,
    };
  }

  if (test.testType === TestType.WeighingPerformance) {
    const result = test.result as WeighingPerformanceTestResult;
    const observation = decisiveObservation(result.observationResults, result.outcome);
    return {
      ...base,
      mpe: String(observation.mpe),
      complianceTrace: observation.trace,
    };
  }

  if (test.testType === TestType.Discrimination) {
    const result = test.result as DiscriminationTestResult;
    const observation = decisiveObservation(result.observationResults, result.outcome);
    return {
      ...base,
      mpe: '0',
      complianceTrace: observation.trace,
    };
  }
  
  if (test.testType === TestType.ZeroSettingAccuracy) {
    const result = test.result as import('@/lib/r76/calculations/zero-setting').ZeroSettingAccuracyTestResult;
    const observation = decisiveObservation(result.observationResults, result.outcome);
    return {
      ...base,
      mpe: String(observation.mpe),
      complianceTrace: observation.trace,
    };
  }

  const result = test.result as EccentricityTestResult;
  const observation = decisiveObservation(result.observationResults, result.outcome);
  return {
    ...base,
    mpe: String(observation.mpe),
    complianceTrace: observation.trace,
  };
}

export function storedOutcomeForDisplay(outcome: StoredTestOutcome): TestOutcome {
  if (outcome === 'PASS') return TestOutcome.Pass;
  if (outcome === 'FAIL') return TestOutcome.Fail;
  return TestOutcome.RequiresRetest;
}

export function engineTypeForStoredType(testType: StoredTestType): TestType {
  if (testType === 'WEIGHING_PERFORMANCE') return TestType.WeighingPerformance;
  if (testType === 'REPEATABILITY') return TestType.Repeatability;
  if (testType === 'DISCRIMINATION') return TestType.Discrimination;
  if (testType === 'ZERO_SETTING_ACCURACY') return TestType.ZeroSettingAccuracy;
  return TestType.EccentricLoading;
}

function canonicalFormNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  const number = Number(trimmed);
  return Number.isFinite(number) ? String(number) : trimmed;
}

/** Canonical signature of the exact form inputs sent to the engine. */
export function observationStateSignature(
  weighingRows: WeighingRowState[],
  repeatability: RepeatabilityFormState,
  eccentricRows: EccentricRowState[],
  eccentricZeroDetermined: boolean,
  discriminationRows: DiscriminationRowState[]
): string {
  return JSON.stringify({
    weighingPerformance: weighingRows.map((row, sequenceIndex) => ({
      sequenceIndex,
      load: canonicalFormNumber(row.load),
      indicatedValue: canonicalFormNumber(row.indicatedValue),
      additionalLoad: canonicalFormNumber(row.additionalLoad),
      zeroError: canonicalFormNumber(row.zeroError),
      loadingDirection: row.loadingDirection,
    })),
    repeatability: {
      testLoad: canonicalFormNumber(repeatability.testLoad),
      indications: repeatability.indications.map(canonicalFormNumber),
      autoZeroOrTrackingActive: repeatability.autoZeroOrTrackingActive,
      ...(repeatability.series && repeatability.series.length > 0 ? {
        series: repeatability.series.map((s) => ({
          seriesNumber: s.seriesNumber,
          testLoad: canonicalFormNumber(s.testLoad),
          indications: s.indications.map(canonicalFormNumber),
        })),
      } : {}),
    },
    eccentricLoading: eccentricRows.map((row) => ({
      positionId: row.positionId.trim(),
      appliedLoad: canonicalFormNumber(row.appliedLoad),
      indicatedValue: canonicalFormNumber(row.indicatedValue),
      additionalLoad: canonicalFormNumber(row.additionalLoad),
      zeroError: canonicalFormNumber(row.zeroError),
      autoZeroOrTrackingDisabled: row.autoZeroOrTrackingDisabled,
    })),
    eccentricZeroDeterminedBeforeEachLoading: eccentricZeroDetermined,
    discrimination: discriminationRows.map((row) => ({
      testLoad: canonicalFormNumber(row.testLoad),
      indicationBefore: canonicalFormNumber(row.indicationBefore),
      indicationAfter: canonicalFormNumber(row.indicationAfter),
    })),
  });
}
