import { Instrument } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { TestType } from '../types/test';
import { 
  WeighingPerformanceObservation, 
  RepeatabilityObservation, 
  EccentricLoadingObservation 
} from '../types/observations';
import { TestSelectionResult, selectTests } from '../test-selection/engine';
import { evaluateWeighingPerformanceTest, WeighingPerformanceTestResult } from '../calculations/weighing';
import { evaluateRepeatabilityTest, RepeatabilityTestResult } from '../calculations/repeatability';
import { evaluateEccentricLoadingTest, EccentricityTestResult } from '../calculations/eccentricity';
import { TestOutcome } from '../types/results';

export interface TestObservations {
  weighingPerformance?: WeighingPerformanceObservation[];
  repeatability?: RepeatabilityObservation;
  eccentricLoading?: EccentricLoadingObservation[];
  eccentricZeroDeterminedBeforeEachLoading?: boolean;
}

export enum OverallOutcome {
  Pass = 'pass',
  Fail = 'fail',
  RequiresRetest = 'requires_retest',
  Incomplete = 'incomplete',
  ManualReview = 'manual_review',
}

export type EvaluatedTestStatus = 'passed' | 'failed' | 'requires_retest' | 'incomplete' | 'manual_review';

export interface EvaluatedTest {
  testType: TestType;
  selection: TestSelectionResult;
  result?: WeighingPerformanceTestResult | RepeatabilityTestResult | EccentricityTestResult;
  status: EvaluatedTestStatus;
  errorMessage?: string;
}

export interface OrchestrationResult {
  instrument: Instrument;
  verificationContext: VerificationContext;
  testSelectionResults: TestSelectionResult[];
  evaluatedTests: EvaluatedTest[];
  overallOutcome: OverallOutcome;
  counts: {
    selected: number;
    passed: number;
    failed: number;
    requiresRetest: number;
    incomplete: number;
    manualReview: number;
  };
  explanation: string;
}

/**
 * End-to-end R76 evaluation and orchestration service.
 * Determines applicable tests, evaluates provided observations, and resolves the overall compliance status.
 */
export function evaluateInstrumentCompliance(
  instrument: Instrument,
  context: VerificationContext,
  observations: TestObservations
): OrchestrationResult {
  const selectionResults = selectTests(instrument, context);
  const evaluatedTests: EvaluatedTest[] = [];

  const counts = {
    selected: selectionResults.length,
    passed: 0,
    failed: 0,
    requiresRetest: 0,
    incomplete: 0,
    manualReview: 0
  };

  for (const selection of selectionResults) {
    // 1. Check for manual review / unsupported conditions
    const isManualReview = !selection.isApplicable;
    
    if (isManualReview) {
      evaluatedTests.push({
        testType: selection.testType,
        selection,
        status: 'manual_review'
      });
      counts.manualReview++;
      continue;
    }

    // 2. Extract specific observations and evaluate
    let status: EvaluatedTestStatus = 'incomplete';
    let errorMessage: string | undefined;
    let result: WeighingPerformanceTestResult | RepeatabilityTestResult | EccentricityTestResult | undefined;

    try {
      if (selection.testType === TestType.WeighingPerformance) {
        if (!observations.weighingPerformance || observations.weighingPerformance.length === 0) {
          status = 'incomplete';
        } else {
          result = evaluateWeighingPerformanceTest(observations.weighingPerformance, instrument, context);
        }
      } 
      else if (selection.testType === TestType.Repeatability) {
        if (!observations.repeatability) {
          status = 'incomplete';
        } else {
          result = evaluateRepeatabilityTest(observations.repeatability, instrument, context);
        }
      } 
      else if (selection.testType === TestType.EccentricLoading) {
        if (!observations.eccentricLoading || observations.eccentricLoading.length === 0) {
          status = 'incomplete';
        } else {
          result = evaluateEccentricLoadingTest(
            observations.eccentricLoading, 
            instrument, 
            context, 
            observations.eccentricZeroDeterminedBeforeEachLoading ?? false
          );
        }
      }
    } catch (error) {
      // If evaluation throws (e.g. invalid observations, missing required fields), reject as incomplete/invalid
      status = 'incomplete';
      errorMessage = error instanceof Error ? error.message : 'Unknown error during evaluation';
    }

    // 3. Map calculation outcome to orchestration status if successfully evaluated
    if (result) {
      if (result.outcome === TestOutcome.Pass) {
        status = 'passed';
      } else if (result.outcome === TestOutcome.Fail) {
        status = 'failed';
      } else if (result.outcome === TestOutcome.RequiresRetest) {
        status = 'requires_retest';
      }
    }

    evaluatedTests.push({
      testType: selection.testType,
      selection,
      result,
      status,
      errorMessage
    });

    // Tally counts
    if (status === 'passed') counts.passed++;
    else if (status === 'failed') counts.failed++;
    else if (status === 'requires_retest') counts.requiresRetest++;
    else if (status === 'incomplete') counts.incomplete++;
  }

  // 4. Determine overall outcome with precedence
  let overallOutcome = OverallOutcome.Pass;
  if (counts.failed > 0) {
    overallOutcome = OverallOutcome.Fail;
  } else if (counts.requiresRetest > 0) {
    overallOutcome = OverallOutcome.RequiresRetest;
  } else if (counts.manualReview > 0) {
    overallOutcome = OverallOutcome.ManualReview;
  } else if (counts.incomplete > 0) {
    overallOutcome = OverallOutcome.Incomplete;
  } else {
    overallOutcome = OverallOutcome.Pass;
  }

  // 5. Generate human readable explanation
  let explanation = '';
  if (overallOutcome === OverallOutcome.Pass) {
    explanation = 'Instrument fully complies with all supported R76 evaluations.';
  } else if (overallOutcome === OverallOutcome.Fail) {
    explanation = 'Instrument FAILS compliance due to one or more test failures.';
  } else if (overallOutcome === OverallOutcome.RequiresRetest) {
    explanation = 'Compliance evaluation requires a mandatory retest (e.g. zero determination prior to each loading) to finalize the result.';
  } else if (overallOutcome === OverallOutcome.ManualReview) {
    explanation = 'Evaluation is halted pending manual review for unsupported or special configurations.';
  } else if (overallOutcome === OverallOutcome.Incomplete) {
    explanation = 'Compliance evaluation is incomplete due to missing or invalid observation data for one or more applicable tests.';
  }

  return {
    instrument,
    verificationContext: context,
    testSelectionResults: selectionResults,
    evaluatedTests,
    overallOutcome,
    counts,
    explanation
  };
}
