/**
 * @file trace.test.ts
 * @description Tests for the Compliance Trace data attached to R76 evaluation results.
 *
 * These tests verify:
 * - Trace data structure is correct and complete
 * - R76 references cite the correct document, clauses, and annexes
 * - Existing PASS/FAIL/REQUIRES_RETEST behaviour is unchanged
 * - Existing MPE boundary values are unchanged
 * - No compliance logic is re-implemented here (trace is backend-produced)
 */

import { describe, it, expect } from 'vitest';
import { evaluateWeighingObservation, evaluateWeighingPerformanceTest } from './weighing';
import { evaluateRepeatabilityTest } from './repeatability';
import { evaluateEccentricLoadingTest, evaluateEccentricPosition } from './eccentricity';
import type { WeighingPerformanceObservation, RepeatabilityObservation, EccentricLoadingObservation } from '../types/observations';
import { AccuracyClass, Instrument, InstrumentType } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { TestOutcome } from '../types/results';

// ── Shared fixture ────────────────────────────────────────────────────────────

const baseInstrument: Instrument = {
  id: 'trace-test-inst',
  manufacturer: 'TraceMaker',
  model: 'TraceModel',
  accuracyClass: AccuracyClass.III,
  max: 15000,
  min: 100,
  e: 5,
  d: 5,
  numberOfSupportPoints: 4,
  additiveTareEffect: false,
  hasAutoZeroOrTracking: true,
  hasInitialZeroSettingDevice: false,
  initialZeroSettingRange: 0,
  hasFineDisplayDevice: false,
  instrumentType: InstrumentType.SingleRange,
};

const initialContext = VerificationContext.InitialVerification;
const serviceContext = VerificationContext.ServiceInspection;

// ── Weighing Performance Trace ────────────────────────────────────────────────

describe('Weighing Performance — Compliance Trace', () => {
  const obs: WeighingPerformanceObservation = {
    sequenceIndex: 0,
    load: 1000,
    indicatedValue: 1000,
    additionalLoad: 1.5,
    zeroError: 0.5,
    loadingDirection: 'increasing',
  };

  it('returns a trace on the observation result', () => {
    const res = evaluateWeighingObservation(obs, baseInstrument, initialContext);
    expect(res.trace).toBeDefined();
  });

  it('trace contains instrumentContext with accuracy class and e', () => {
    const res = evaluateWeighingObservation(obs, baseInstrument, initialContext);
    expect(res.trace.instrumentContext['Accuracy Class']).toBe(AccuracyClass.III);
    expect(res.trace.instrumentContext['e (kg)']).toBe(5);
    expect(res.trace.instrumentContext['Verification Context']).toBe('Initial Verification');
  });

  it('trace references include clause 3.5.1 / Table 6 for MPE', () => {
    const res = evaluateWeighingObservation(obs, baseInstrument, initialContext);
    const mpeRef = res.trace.references.find(r => r.table === 'Table 6');
    expect(mpeRef).toBeDefined();
    expect(mpeRef!.document).toBe('OIML R 76-1:2006 (E)');
    expect(mpeRef!.clause).toBe('3.5.1');
  });

  it('trace references include Annex A.4.4.3 for the error formula', () => {
    const res = evaluateWeighingObservation(obs, baseInstrument, initialContext);
    const formulaRef = res.trace.references.find(r => r.annex === 'Annex A.4.4.3');
    expect(formulaRef).toBeDefined();
    expect(formulaRef!.document).toBe('OIML R 76-1:2006 (E)');
  });

  it('trace references include Annex A.4.4.1 for the general weighing test', () => {
    const res = evaluateWeighingObservation(obs, baseInstrument, initialContext);
    const procRef = res.trace.references.find(r => r.annex === 'Annex A.4.4.1');
    expect(procRef).toBeDefined();
  });

  it('trace inputs contain L, I, ΔL, E0 with correct values', () => {
    const res = evaluateWeighingObservation(obs, baseInstrument, initialContext);
    expect(res.trace.inputs['L — Applied load (kg)']).toBe(1000);
    expect(res.trace.inputs['I — Indicated value (kg)']).toBe(1000);
    expect(res.trace.inputs['ΔL — Additional load (kg)']).toBe(1.5);
    expect(res.trace.inputs['E0 — Zero error (kg)']).toBe(0.5);
  });

  it('trace has three calculation steps: P, E, Ec', () => {
    const res = evaluateWeighingObservation(obs, baseInstrument, initialContext);
    expect(res.trace.calculationSteps).toHaveLength(3);
    expect(res.trace.calculationSteps[0].formula).toBe('P = I + 0.5e − ΔL');
    expect(res.trace.calculationSteps[1].formula).toBe('E = P − L');
    expect(res.trace.calculationSteps[2].formula).toBe('Ec = E − E0');
  });

  it('trace calculation step results match the existing computed values', () => {
    // P = 1000 + 0.5(5) - 1.5 = 1001; E = 1001 - 1000 = 1; Ec = 1 - 0.5 = 0.5
    const res = evaluateWeighingObservation(obs, baseInstrument, initialContext);
    expect(res.trace.calculationSteps[0].result).toBe(res.indicationPriorToRounding); // P
    expect(res.trace.calculationSteps[1].result).toBe(res.errorPriorToRounding);       // E
    expect(res.trace.calculationSteps[2].result).toBe(res.calculatedError);            // Ec
  });

  it('trace mpeTrace exposes Table 6 band, factor, baseMPE, multiplier, effectiveMPE', () => {
    const res = evaluateWeighingObservation(obs, baseInstrument, initialContext);
    const mt = res.trace.mpeTrace;
    expect(mt.accuracyClass).toBe(AccuracyClass.III);
    expect(mt.load).toBe(1000);
    expect(mt.e).toBe(5);
    expect(mt.loadOverE).toBe(200); // 1000/5
    expect(mt.tableBand).toBe('0 ≤ m ≤ 500e');
    expect(mt.mpeFactor).toBe('0.5e');
    expect(mt.baseMPE).toBe(2.5); // 0.5 * 5
    expect(mt.contextMultiplier).toBe(1);
    expect(mt.effectiveMPE).toBe(2.5);
    expect(mt.verificationContext).toBe('Initial Verification');
  });

  it('trace comparison uses |Ec| ≤ MPE formula and reflects the actual outcome', () => {
    const res = evaluateWeighingObservation(obs, baseInstrument, initialContext);
    expect(res.trace.comparison.formula).toBe('|Ec| ≤ MPE');
    expect(res.trace.comparison.passed).toBe(true);
    expect(res.trace.outcome).toBe(TestOutcome.Pass);
  });

  it('trace outcome is FAIL when observation fails (existing behaviour unchanged)', () => {
    // L=1000, I=1000, deltaL=0, E0=-0.5 → Ec=3.0, MPE=2.5 → FAIL
    const failObs: WeighingPerformanceObservation = { ...obs, additionalLoad: 0, zeroError: -0.5 };
    const res = evaluateWeighingObservation(failObs, baseInstrument, initialContext);
    expect(res.outcome).toBe(TestOutcome.Fail);
    expect(res.trace.outcome).toBe(TestOutcome.Fail);
    expect(res.trace.comparison.passed).toBe(false);
  });

  it('test-level result carries traces[] array with one entry per observation', () => {
    const passObs: WeighingPerformanceObservation = { ...obs };
    const res = evaluateWeighingPerformanceTest([passObs, passObs], baseInstrument, initialContext);
    expect(res.traces).toHaveLength(2);
    res.traces.forEach(t => expect(t).toBeDefined());
  });

  // Guard: existing PASS/FAIL numerical behaviour unchanged
  it('existing MPE boundary values are unchanged', () => {
    // Class III, 500e boundary: 2500/5=500 → MPE=2.5
    const boundaryObs: WeighingPerformanceObservation = {
      sequenceIndex: 0, load: 2500, indicatedValue: 2500,
      additionalLoad: 0, zeroError: 0, loadingDirection: 'increasing',
    };
    const res = evaluateWeighingObservation(boundaryObs, baseInstrument, initialContext);
    expect(res.mpe).toBe(2.5);
    expect(res.trace.mpeTrace.effectiveMPE).toBe(2.5);
  });

  it('Service Inspection multiplier appears in trace mpeTrace', () => {
    const res = evaluateWeighingObservation(obs, baseInstrument, serviceContext);
    expect(res.trace.mpeTrace.contextMultiplier).toBe(2);
    expect(res.trace.mpeTrace.effectiveMPE).toBe(5.0); // 2.5 × 2
    expect(res.trace.mpeTrace.verificationContext).toBe('Service Inspection');
  });
});

// ── Repeatability Trace ───────────────────────────────────────────────────────

describe('Repeatability — Compliance Trace', () => {
  const obs: RepeatabilityObservation = {
    testLoad: 1000,
    indications: [1000.0, 1002.0, 1001.0],
    autoZeroOrTrackingActive: true,
  };

  it('returns a trace on the repeatability result', () => {
    const res = evaluateRepeatabilityTest(obs, baseInstrument, initialContext);
    expect(res.trace).toBeDefined();
  });

  it('trace inputs contain all indications and test load', () => {
    const res = evaluateRepeatabilityTest(obs, baseInstrument, initialContext);
    expect(res.trace.inputs['Test load L (kg)']).toBe(1000);
    expect(res.trace.inputs['Number of weighings']).toBe(3);
    expect(String(res.trace.inputs['Indications'])).toContain('1000');
    expect(String(res.trace.inputs['Indications'])).toContain('1002');
    expect(res.trace.inputs['Imax (kg)']).toBe(1002.0);
    expect(res.trace.inputs['Imin (kg)']).toBe(1000.0);
  });

  it('trace has three calculation steps: Imax, Imin, R', () => {
    const res = evaluateRepeatabilityTest(obs, baseInstrument, initialContext);
    expect(res.trace.calculationSteps).toHaveLength(3);
    expect(res.trace.calculationSteps[0].formula).toMatch(/Imax/);
    expect(res.trace.calculationSteps[1].formula).toMatch(/Imin/);
    expect(res.trace.calculationSteps[2].formula).toBe('R = Imax − Imin');
  });

  it('trace R step result matches the computed repeatabilityRange', () => {
    const res = evaluateRepeatabilityTest(obs, baseInstrument, initialContext);
    expect(res.trace.calculationSteps[2].result).toBe(res.repeatabilityRange); // 2.0
  });

  it('trace references include clause 3.6.1 and Annex A.4.10', () => {
    const res = evaluateRepeatabilityTest(obs, baseInstrument, initialContext);
    const clauseRef = res.trace.references.find(r => r.clause === '3.6.1');
    expect(clauseRef).toBeDefined();
    expect(clauseRef!.document).toBe('OIML R 76-1:2006 (E)');

    const annexRef = res.trace.references.find(r => r.annex === 'Annex A.4.10');
    expect(annexRef).toBeDefined();
    expect(annexRef!.document).toBe('OIML R 76-1:2006 (E)');
  });

  it('trace comparison uses R ≤ MPE formula', () => {
    const res = evaluateRepeatabilityTest(obs, baseInstrument, initialContext);
    expect(res.trace.comparison.formula).toBe('R ≤ MPE');
    expect(res.trace.comparison.passed).toBe(true);
  });

  it('trace outcome is FAIL when R > MPE (existing behaviour unchanged)', () => {
    const failObs: RepeatabilityObservation = { ...obs, indications: [1000.0, 1005.0, 1001.0] };
    const res = evaluateRepeatabilityTest(failObs, baseInstrument, initialContext);
    expect(res.outcome).toBe(TestOutcome.Fail);
    expect(res.trace.outcome).toBe(TestOutcome.Fail);
    expect(res.trace.comparison.passed).toBe(false);
  });

  it('trace mpeTrace exposes correct values for repeatability load', () => {
    const res = evaluateRepeatabilityTest(obs, baseInstrument, initialContext);
    expect(res.trace.mpeTrace.load).toBe(1000);
    expect(res.trace.mpeTrace.effectiveMPE).toBe(res.mpe);
  });

  it('trace instrumentContext records required weighings count', () => {
    const res = evaluateRepeatabilityTest(obs, baseInstrument, initialContext);
    expect(res.trace.instrumentContext['Required weighings']).toBe(3);
  });
});

// ── Eccentric Loading Trace ───────────────────────────────────────────────────

describe('Eccentric Loading — Compliance Trace', () => {
  const makeObs = (
    positionId: string,
    L: number,
    I: number,
    deltaL: number,
    E0: number,
    autoZeroDisabled = true
  ): EccentricLoadingObservation => ({
    positionId, appliedLoad: L, indicatedValue: I,
    additionalLoad: deltaL, zeroError: E0,
    autoZeroOrTrackingDisabled: autoZeroDisabled,
  });

  it('returns a trace on each position result', () => {
    const obs = makeObs('Pos1', 5000, 5000, 2.5, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, false);
    expect(res.trace).toBeDefined();
  });

  it('trace inputs contain position ID, L, I, ΔL, E0', () => {
    const obs = makeObs('Centre', 5000, 5000, 2.5, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, false);
    expect(res.trace.inputs['Position ID']).toBe('Centre');
    expect(res.trace.inputs['L — Applied load (kg)']).toBe(5000);
    expect(res.trace.inputs['I — Indicated value (kg)']).toBe(5000);
    expect(res.trace.inputs['ΔL — Additional load (kg)']).toBe(2.5);
    expect(res.trace.inputs['E0 — Zero error (kg)']).toBe(0);
  });

  it('trace has three calculation steps: P, E, Ec', () => {
    const obs = makeObs('Pos1', 5000, 5000, 2.5, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, false);
    expect(res.trace.calculationSteps).toHaveLength(3);
    expect(res.trace.calculationSteps[0].formula).toBe('P = I + 0.5e − ΔL');
    expect(res.trace.calculationSteps[1].formula).toBe('E = P − L');
    expect(res.trace.calculationSteps[2].formula).toBe('Ec = E − E0');
  });

  it('trace calculation step results match the computed position values', () => {
    const obs = makeObs('Pos1', 5000, 5000, 2.5, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, false);
    expect(res.trace.calculationSteps[0].result).toBe(res.indicationPriorToRounding);
    expect(res.trace.calculationSteps[1].result).toBe(res.errorPriorToRounding);
    expect(res.trace.calculationSteps[2].result).toBe(res.calculatedError);
  });

  it('trace references include clause 3.6.2 (general eccentric requirement)', () => {
    const obs = makeObs('Pos1', 5000, 5000, 2.5, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, false);
    const ref362 = res.trace.references.find(r => r.clause === '3.6.2');
    expect(ref362).toBeDefined();
    expect(ref362!.document).toBe('OIML R 76-1:2006 (E)');
  });

  it('trace references include clause 3.6.2.1 (load rule)', () => {
    const obs = makeObs('Pos1', 5000, 5000, 2.5, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, false);
    const ref3621 = res.trace.references.find(r => r.clause === '3.6.2.1');
    expect(ref3621).toBeDefined();
    expect(ref3621!.document).toBe('OIML R 76-1:2006 (E)');
  });

  it('trace references include Annex A.4.7 (procedure and retest)', () => {
    const obs = makeObs('Pos1', 5000, 5000, 2.5, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, false);
    const a47 = res.trace.references.find(r => r.annex === 'Annex A.4.7');
    expect(a47).toBeDefined();
    expect(a47!.document).toBe('OIML R 76-1:2006 (E)');
  });

  it('trace references include Annex A.4.7.1 (≤4 support points)', () => {
    const obs = makeObs('Pos1', 5000, 5000, 2.5, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, false);
    const a471 = res.trace.references.find(r => r.annex === 'Annex A.4.7.1');
    expect(a471).toBeDefined();
    expect(a471!.document).toBe('OIML R 76-1:2006 (E)');
  });

  it('trace comparison uses |Ec| ≤ MPE formula', () => {
    const obs = makeObs('Pos1', 5000, 5000, 2.5, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, false);
    expect(res.trace.comparison.formula).toBe('|Ec| ≤ MPE');
    expect(res.trace.comparison.passed).toBe(true);
  });

  it('REQUIRES_RETEST: trace outcome matches position outcome when zero NOT determined before each loading', () => {
    // L=5000, I=5005, deltaL=0, E0=0 → P=5007.5, E=7.5, Ec=7.5 > MPE=5
    const obs = makeObs('Pos1', 5000, 5005, 0, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, false);
    expect(res.outcome).toBe(TestOutcome.RequiresRetest);
    expect(res.trace.outcome).toBe(TestOutcome.RequiresRetest);
    expect(res.trace.comparison.passed).toBe(false);
    // Retest note should be present in inputs
    const retestNote = res.trace.inputs['Retest note'];
    expect(retestNote).toBeDefined();
    expect(String(retestNote)).toContain('NOT determined before each individual loading');
  });

  it('FAIL: trace outcome matches position outcome when zero IS determined before each loading', () => {
    const obs = makeObs('Pos1', 5000, 5005, 0, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, true);
    expect(res.outcome).toBe(TestOutcome.Fail);
    expect(res.trace.outcome).toBe(TestOutcome.Fail);
    expect(res.trace.comparison.passed).toBe(false);
    const retestNote = res.trace.inputs['Retest note'];
    expect(String(retestNote)).toContain('WAS determined before each individual loading');
  });

  it('trace instrumentContext records zeroDeterminedBeforeEachLoading flag', () => {
    const obs = makeObs('Pos1', 5000, 5000, 2.5, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, true);
    expect(res.trace.instrumentContext['Zero determined before each loading']).toBe(true);
  });

  it('trace mpeTrace exposes effectiveMPE matching the position mpe field', () => {
    const obs = makeObs('Pos1', 5000, 5000, 2.5, 0);
    const res = evaluateEccentricPosition(obs, baseInstrument, initialContext, false);
    expect(res.trace.mpeTrace.effectiveMPE).toBe(res.mpe);
  });

  it('full test result: all position traces are present', () => {
    const observations = [
      makeObs('Pos1', 5000, 5000, 2.5, 0),
      makeObs('Pos2', 5000, 5000, 2.0, 0),
      makeObs('Pos3', 5000, 5000, 1.5, 0),
      makeObs('Pos4', 5000, 5000, 1.0, 0),
    ];
    const res = evaluateEccentricLoadingTest(observations, baseInstrument, initialContext, false);
    expect(res.outcome).toBe(TestOutcome.Pass);
    res.observationResults.forEach(r => expect(r.trace).toBeDefined());
  });

  // Guard: existing PASS/FAIL/REQUIRES_RETEST behaviour unchanged
  it('existing REQUIRES_RETEST outcome unchanged by trace addition', () => {
    const obs = [makeObs('Pos1', 5000, 5005, 0, 0)];
    const res = evaluateEccentricLoadingTest(obs, baseInstrument, initialContext, false);
    expect(res.outcome).toBe(TestOutcome.RequiresRetest);
    expect(res.retestRequired).toBe(true);
  });

  it('existing FAIL outcome unchanged by trace addition', () => {
    const obs = [makeObs('Pos1', 5000, 5005, 0, 0)];
    const res = evaluateEccentricLoadingTest(obs, baseInstrument, initialContext, true);
    expect(res.outcome).toBe(TestOutcome.Fail);
    expect(res.retestRequired).toBe(false);
  });
});

// ── No frontend compliance calculation guard ──────────────────────────────────

describe('Structural guard — no frontend compliance calculation', () => {
  it('ComplianceTrace.comparison.passed is a pre-computed boolean from the backend, not derived from trace fields', () => {
    // Verify the comparison object carries a pre-determined boolean; the frontend
    // need only read trace.comparison.passed — not compare trace.calculationSteps[2].result against trace.mpeTrace.effectiveMPE.
    const obs: WeighingPerformanceObservation = {
      sequenceIndex: 0, load: 1000, indicatedValue: 1000,
      additionalLoad: 1.5, zeroError: 0.5, loadingDirection: 'increasing',
    };
    const res = evaluateWeighingObservation(obs, baseInstrument, initialContext);
    expect(typeof res.trace.comparison.passed).toBe('boolean');
    // Outcome enum is also embedded in the trace — no recalculation needed in the UI
    expect(Object.values(TestOutcome)).toContain(res.trace.outcome);
  });
});
