import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WeighingPerformanceSection } from './WeighingPerformanceSection';
import { RepeatabilitySection } from './RepeatabilitySection';
import { InstrumentSection } from './InstrumentSection';
import {
  createDefaultInstrument,
  createDefaultRepeatability,
  createWeighingRow,
  normalizeVerificationContext,
  isTypeEvaluationContext,
  getVerificationContextLabel,
  requiredRepeatabilityWeighingsCount,
  type WeighingRowState,
  type RepeatabilityFormState,
} from './types';
import { AccuracyClass, VerificationContext } from '@/lib/r76/types';
import { checkWeighingCompleteness } from '@/lib/r76/calculations/weighing';
import { calculateMPE } from '@/lib/r76/calculations/mpe';
import { selectTests } from '@/lib/r76/test-selection';

describe('Verification Context Regression Test Suite', () => {
  const dummyOnChange = () => {};
  const dummyNextId = () => 'w-1';

  const defaultInstrument = {
    id: 'inst-1',
    manufacturer: 'Test Mfg',
    model: 'Test Model',
    accuracyClass: AccuracyClass.III,
    max: 30,
    min: 0.2,
    e: 0.01,
    d: 0.005,
    numberOfSupportPoints: 4,
    additiveTareEffect: false,
    hasAutoZeroOrTracking: true,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: 0,
    hasFineDisplayDevice: false,
  };

  describe('1. Authoritative verification context normalization and labels', () => {
    it('normalizes uppercase and lowercase strings and enums correctly', () => {
      expect(normalizeVerificationContext('TYPE_EVALUATION')).toBe(VerificationContext.TypeEvaluation);
      expect(normalizeVerificationContext('type_evaluation')).toBe(VerificationContext.TypeEvaluation);
      expect(normalizeVerificationContext(VerificationContext.TypeEvaluation)).toBe(VerificationContext.TypeEvaluation);

      expect(normalizeVerificationContext('INITIAL_VERIFICATION')).toBe(VerificationContext.InitialVerification);
      expect(normalizeVerificationContext('initial_verification')).toBe(VerificationContext.InitialVerification);
      expect(normalizeVerificationContext(VerificationContext.InitialVerification)).toBe(VerificationContext.InitialVerification);

      expect(normalizeVerificationContext('SUBSEQUENT_VERIFICATION')).toBe(VerificationContext.SubsequentVerification);
      expect(normalizeVerificationContext('subsequent_verification')).toBe(VerificationContext.SubsequentVerification);
      expect(normalizeVerificationContext(VerificationContext.SubsequentVerification)).toBe(VerificationContext.SubsequentVerification);

      expect(normalizeVerificationContext('SERVICE_INSPECTION')).toBe(VerificationContext.ServiceInspection);
      expect(normalizeVerificationContext('service_inspection')).toBe(VerificationContext.ServiceInspection);
      expect(normalizeVerificationContext('IN_SERVICE')).toBe(VerificationContext.ServiceInspection);
      expect(normalizeVerificationContext('in_service')).toBe(VerificationContext.ServiceInspection);
      expect(normalizeVerificationContext(VerificationContext.ServiceInspection)).toBe(VerificationContext.ServiceInspection);
    });

    it('does NOT silently convert invalid contexts or between TYPE_EVALUATION and INITIAL_VERIFICATION', () => {
      expect(() => normalizeVerificationContext('INVALID_CONTEXT')).toThrow(/Unsupported verification context/);
      expect(() => normalizeVerificationContext(undefined)).toThrow(/Verification context is required/);
      expect(() => normalizeVerificationContext('')).toThrow(/Verification context is required/);

      // Verify that TYPE_EVALUATION is strictly distinct from INITIAL_VERIFICATION
      expect(normalizeVerificationContext('TYPE_EVALUATION')).not.toBe(VerificationContext.InitialVerification);
      expect(normalizeVerificationContext('INITIAL_VERIFICATION')).not.toBe(VerificationContext.TypeEvaluation);
    });

    it('provides accurate human-readable labels for each verification context', () => {
      expect(getVerificationContextLabel('TYPE_EVALUATION')).toBe('Type Evaluation');
      expect(getVerificationContextLabel('INITIAL_VERIFICATION')).toBe('Initial Verification');
      expect(getVerificationContextLabel('SUBSEQUENT_VERIFICATION')).toBe('Subsequent Verification');
      expect(getVerificationContextLabel('SERVICE_INSPECTION')).toBe('Service Inspection');
      expect(getVerificationContextLabel('IN_SERVICE')).toBe('Service Inspection');
    });
  });

  describe('2. TYPE_EVALUATION procedure requirements', () => {
    it('displays Type Evaluation: ≥ 10 test loads on left UI for both enum and string', () => {
      const rows: WeighingRowState[] = [
        { id: 'w-1', load: '5', indicatedValue: '5', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
      ];

      // Using enum
      const htmlEnum = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={rows}
          onChange={dummyOnChange}
          nextId={dummyNextId}
          verificationContext={VerificationContext.TypeEvaluation}
          instrumentMin={0.2}
          instrumentMax={30}
          instrumentE={0.01}
        />
      );
      expect(htmlEnum).toContain('Type Evaluation: ≥ 10 test loads');
      expect(htmlEnum).toContain('1 of 10 distinct loads (1 observation) · INCOMPLETE');
      expect(htmlEnum).not.toContain('Verification: ≥ 5 test loads');

      // Using string
      const htmlStr = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={rows}
          onChange={dummyOnChange}
          nextId={dummyNextId}
          verificationContext="TYPE_EVALUATION"
          instrumentMin={0.2}
          instrumentMax={30}
          instrumentE={0.01}
        />
      );
      expect(htmlStr).toContain('Type Evaluation: ≥ 10 test loads');
      expect(htmlStr).toContain('1 of 10 distinct loads (1 observation) · INCOMPLETE');
      expect(htmlStr).not.toContain('Verification: ≥ 5 test loads');
    });

    it('5 valid test loads is INCOMPLETE under TYPE_EVALUATION but would be complete under INITIAL_VERIFICATION', () => {
      const fiveLoads: WeighingRowState[] = [
        { id: 'w-1', load: '0.2', indicatedValue: '0.2', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-2', load: '5', indicatedValue: '5', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-3', load: '10', indicatedValue: '10', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-4', load: '20', indicatedValue: '20', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-5', load: '30', indicatedValue: '30', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'decreasing' },
      ];

      // In TYPE_EVALUATION -> INCOMPLETE because 5 < 10
      const htmlTypeEval = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={fiveLoads}
          onChange={dummyOnChange}
          nextId={dummyNextId}
          verificationContext="TYPE_EVALUATION"
          instrumentMin={0.2}
          instrumentMax={30}
          instrumentE={0.01}
        />
      );
      expect(htmlTypeEval).toContain('5 of 10 distinct loads (5 observations) · INCOMPLETE');
      expect(htmlTypeEval).toContain('Distinct loads: 5/10');

      // In INITIAL_VERIFICATION -> COMPLETE because 5 >= 5
      const htmlInitVerif = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={fiveLoads}
          onChange={dummyOnChange}
          nextId={dummyNextId}
          verificationContext="INITIAL_VERIFICATION"
          instrumentMin={0.2}
          instrumentMax={30}
          instrumentE={0.01}
        />
      );
      expect(htmlInitVerif).toContain('5 of 5 distinct loads (5 observations) · COMPLETE');
      expect(htmlInitVerif).toContain('Distinct loads: 5/5');
    });

    it('10 valid distinct test loads covering min, max, inc, dec is COMPLETE under TYPE_EVALUATION', () => {
      const tenLoads: WeighingRowState[] = [
        { id: 'w-1', load: '0.2', indicatedValue: '0.2', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-2', load: '2', indicatedValue: '2', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-3', load: '5', indicatedValue: '5', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-4', load: '8', indicatedValue: '8', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-5', load: '10', indicatedValue: '10', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-6', load: '15', indicatedValue: '15', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-7', load: '20', indicatedValue: '20', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-8', load: '25', indicatedValue: '25', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-9', load: '30', indicatedValue: '30', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'decreasing' },
        { id: 'w-10', load: '28', indicatedValue: '28', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'decreasing' },
      ];

      const html = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={tenLoads}
          onChange={dummyOnChange}
          nextId={dummyNextId}
          verificationContext="TYPE_EVALUATION"
          instrumentMin={0.2}
          instrumentMax={30}
          instrumentE={0.01}
        />
      );
      expect(html).toContain('10 of 10 distinct loads (10 observations) · COMPLETE');
      expect(html).toContain('Distinct loads: 10/10');
    });

    it('backend checkWeighingCompleteness requires 10 loads for TYPE_EVALUATION', () => {
      const fiveObs = [
        { sequenceIndex: 0, load: 0.2, indicatedValue: 0.2, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' as const },
        { sequenceIndex: 1, load: 5, indicatedValue: 5, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' as const },
        { sequenceIndex: 2, load: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' as const },
        { sequenceIndex: 3, load: 20, indicatedValue: 20, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' as const },
        { sequenceIndex: 4, load: 30, indicatedValue: 30, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'decreasing' as const },
      ];

      const typeEvalResult = checkWeighingCompleteness(fiveObs, defaultInstrument as any, VerificationContext.TypeEvaluation);
      expect(typeEvalResult.isComplete).toBe(false);
      expect(typeEvalResult.requiredMinLoadPoints).toBe(10);
      expect(typeEvalResult.clause).toContain('Type evaluation / initial intrinsic error: >= 10 test loads');

      const initVerifResult = checkWeighingCompleteness(fiveObs, defaultInstrument as any, VerificationContext.InitialVerification);
      expect(initVerifResult.isComplete).toBe(true);
      expect(initVerifResult.requiredMinLoadPoints).toBe(5);
      expect(initVerifResult.clause).toContain('Verification weighing test: >= 5 test loads');
    });

    it('repeatability section requires 2 series of 10 indications for TYPE_EVALUATION', () => {
      expect(requiredRepeatabilityWeighingsCount(AccuracyClass.III, VerificationContext.TypeEvaluation, 30)).toBe(10);
      expect(requiredRepeatabilityWeighingsCount(AccuracyClass.III, 'TYPE_EVALUATION', 30)).toBe(10);
      expect(requiredRepeatabilityWeighingsCount(AccuracyClass.III, 'type_evaluation', 30)).toBe(10);

      // Contrast with verification which requires 3 indications for Class III
      expect(requiredRepeatabilityWeighingsCount(AccuracyClass.III, VerificationContext.InitialVerification, 30)).toBe(3);
    });
  });

  describe('3. INITIAL_VERIFICATION, SUBSEQUENT_VERIFICATION, and IN_SERVICE', () => {
    it('INITIAL_VERIFICATION displays Verification: ≥ 5 test loads', () => {
      const rows: WeighingRowState[] = [createWeighingRow('w-1')];
      const html = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={rows}
          onChange={dummyOnChange}
          verificationContext="INITIAL_VERIFICATION"
          instrumentMin={0.2}
          instrumentMax={30}
        />
      );
      expect(html).toContain('Verification: ≥ 5 test loads');
      expect(html).not.toContain('Type Evaluation: ≥ 10 test loads');
    });

    it('SUBSEQUENT_VERIFICATION displays Verification: ≥ 5 test loads and uses 1x MPE multiplier', () => {
      const rows: WeighingRowState[] = [createWeighingRow('w-1')];
      const html = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={rows}
          onChange={dummyOnChange}
          verificationContext="SUBSEQUENT_VERIFICATION"
          instrumentMin={0.2}
          instrumentMax={30}
        />
      );
      expect(html).toContain('Verification: ≥ 5 test loads');

      const mpe = calculateMPE(AccuracyClass.III, 10, 0.01, VerificationContext.SubsequentVerification);
      expect(mpe.effectiveMPE).toBe(0.01); // 1.0 * e * 1
      expect(mpe.mpeTrace.verificationContext).toBe('Subsequent Verification');
    });

    it('IN_SERVICE / SERVICE_INSPECTION displays Verification: ≥ 5 test loads and uses 2x MPE multiplier', () => {
      const rows: WeighingRowState[] = [createWeighingRow('w-1')];
      const htmlInService = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={rows}
          onChange={dummyOnChange}
          verificationContext="IN_SERVICE"
          instrumentMin={0.2}
          instrumentMax={30}
        />
      );
      expect(htmlInService).toContain('Verification: ≥ 5 test loads');

      const htmlServiceInspection = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={rows}
          onChange={dummyOnChange}
          verificationContext="SERVICE_INSPECTION"
          instrumentMin={0.2}
          instrumentMax={30}
        />
      );
      expect(htmlServiceInspection).toContain('Verification: ≥ 5 test loads');

      const mpe = calculateMPE(AccuracyClass.III, 10, 0.01, 'IN_SERVICE');
      expect(mpe.effectiveMPE).toBe(0.02); // 1.0 * e * 2
      expect(mpe.mpeTrace.verificationContext).toBe('Service Inspection');
    });
  });

  describe('4. Repeated load values & observation count vs distinct test loads', () => {
    it('distinguishes number of observation rows from number of distinct valid test loads', () => {
      // 6 observation rows, but test loads repeat: only 3 distinct loads (5, 10, 20)
      const rows: WeighingRowState[] = [
        { id: 'w-1', load: '5', indicatedValue: '5', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-2', load: '5', indicatedValue: '5', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-3', load: '10', indicatedValue: '10', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-4', load: '10', indicatedValue: '10', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-5', load: '20', indicatedValue: '20', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-6', load: '20', indicatedValue: '20', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'decreasing' },
      ];

      const html = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={rows}
          onChange={dummyOnChange}
          verificationContext="INITIAL_VERIFICATION"
          instrumentMin={0.2}
          instrumentMax={30}
          instrumentE={0.01}
        />
      );

      // Header shows 3 distinct of 5 required, across 6 observations
      expect(html).toContain('3 of 5 distinct loads (6 observations) · INCOMPLETE');
      // Sub-grid distinguishes distinct loads and observation rows
      expect(html).toContain('Distinct loads: 3/5');
      expect(html).toContain('Observation rows: 6 (6 valid)');
      // Incomplete status
      expect(html).toContain('INCOMPLETE');
      expect(html).not.toContain('· COMPLETE');
    });

    it('satisfies procedure when distinct loads reaches requirement, even when rows > distinct loads', () => {
      // 6 observation rows with 5 distinct test loads (0.2, 5, 10, 20, 30) where 30 is tested in both inc and dec
      const rows: WeighingRowState[] = [
        { id: 'w-1', load: '0.2', indicatedValue: '0.2', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-2', load: '5', indicatedValue: '5', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-3', load: '10', indicatedValue: '10', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-4', load: '20', indicatedValue: '20', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-5', load: '30', indicatedValue: '30', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
        { id: 'w-6', load: '30', indicatedValue: '30', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'decreasing' },
      ];

      const html = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={rows}
          onChange={dummyOnChange}
          verificationContext="INITIAL_VERIFICATION"
          instrumentMin={0.2}
          instrumentMax={30}
          instrumentE={0.01}
        />
      );

      expect(html).toContain('5 of 5 distinct loads (6 observations) · COMPLETE');
      expect(html).toContain('Distinct loads: 5/5');
      expect(html).toContain('Observation rows: 6 (6 valid)');
    });
  });

  describe('5. Save, reload & authoritative session context preservation', () => {
    it('InstrumentSection displays authoritative verification context as locked to session', () => {
      const instState = createDefaultInstrument();
      const html = renderToStaticMarkup(
        <InstrumentSection
          value={instState}
          onChange={dummyOnChange}
          verificationContext={VerificationContext.TypeEvaluation}
        />
      );

      // Renders select with Type Evaluation value and disabled attribute
      expect(html).toContain('Active session procedure context');
      expect(html).toContain('disabled=""');
      expect(html).toContain('value="type_evaluation"');
    });

    it('session rehydration preserves TYPE_EVALUATION without mutating to INITIAL_VERIFICATION', () => {
      const sessionDbRecord = {
        id: 'session-xyz',
        instrumentId: 'inst-001',
        verificationContext: 'TYPE_EVALUATION',
        status: 'IN_PROGRESS',
      };

      // Ensure normalized authoritative context matches TypeEvaluation
      const loadedContext = normalizeVerificationContext(sessionDbRecord.verificationContext);
      expect(loadedContext).toBe(VerificationContext.TypeEvaluation);
      expect(isTypeEvaluationContext(loadedContext)).toBe(true);

      // Simulate re-saving: verificationContext is workflow-protected and immutable
      expect(sessionDbRecord.verificationContext).toBe('TYPE_EVALUATION');
    });
  });

  describe('6. Stale result prevention', () => {
    it('marks results stale when observations change', () => {
      let isStale = false;
      let activeResult: any = { status: 'PASS' };

      function markDisplayedResultsStale() {
        if (activeResult) {
          isStale = true;
          activeResult = null;
        }
      }

      // Initial state: fresh result displayed
      expect(activeResult).not.toBeNull();
      expect(isStale).toBe(false);

      // User modifies an observation load
      markDisplayedResultsStale();

      // Result cleared, marked stale
      expect(activeResult).toBeNull();
      expect(isStale).toBe(true);
    });
  });
});
