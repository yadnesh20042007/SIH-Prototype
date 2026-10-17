import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validEvaluationFixture } from '@/app/api/r76/evaluate/fixture';
import { evaluateInstrumentCompliance } from '@/lib/r76/engine';
import { toTestResultPersistenceData } from '@/components/Evaluation/result-persistence';
import { logicalObservationFingerprint, assessResultFreshness } from './result-freshness.service';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), session: { findUnique: vi.fn() }, observation: { findMany: vi.fn() },
  result: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
import { evaluateSavedSession } from './session-evaluation.service';

const f = validEvaluationFixture;
const rows = [
  ...f.observations.weighingPerformance!.map(obs => ({ testType: 'WEIGHING_PERFORMANCE', observationData: obs })),
  { testType: 'REPEATABILITY', observationData: f.observations.repeatability! },
  ...f.observations.eccentricLoading!.map(obs => ({ testType: 'ECCENTRIC_LOADING', observationData: obs })),
  ...f.observations.discrimination!.map(obs => ({ testType: 'DISCRIMINATION', observationData: obs }))
].map((row, i) => ({ ...row, id: `o${i}`, sessionId: 's', sequenceIndex: i }));

describe('Saved-session evaluation integration unit tests (mocked Prisma, real engine)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(callback => callback({
      testSession: mocks.session, testObservation: mocks.observation, testResult: mocks.result,
    }));
    mocks.session.findUnique.mockResolvedValue({
      id: 's', rulesetVersionId: 'r', verificationContext: 'TYPE_EVALUATION',
      instrument: { ...f.instrument, instrumentType: 'SINGLE_RANGE', indicationType: 'DIGITAL',
        manufacturer: { name: f.instrument.manufacturer } },
    });
    mocks.observation.findMany.mockResolvedValue(rows);
    mocks.result.findMany.mockResolvedValue([]);
  });

  it('stores only real engine output and server-computed fingerprints in a serializable transaction', async () => {
    const response = await evaluateSavedSession('s');
    const engine = evaluateInstrumentCompliance(f.instrument, f.verificationContext, f.observations);
    expect(response.evaluatedTests).toEqual(engine.evaluatedTests);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
    for (const test of engine.evaluatedTests) {
      const payload = toTestResultPersistenceData(test);
      if (!payload) continue;
      expect(mocks.result.create).toHaveBeenCalledWith({ data: {
        ...payload, sessionId: 's', rulesetVersionId: 'r', repeatabilityRange: payload.repeatabilityRange ?? null,
        evaluatedObservationFingerprint: logicalObservationFingerprint(rows.filter(row => row.testType === payload.testType)),
        evaluatedConfigFingerprint: expect.any(String),
      } });
    }
  });

  it('updates existing logical results and restores CURRENT after an observation change', async () => {
    const changed = rows.map(row => row.testType === 'WEIGHING_PERFORMANCE'
      ? { ...row, observationData: { ...row.observationData, indicatedValue: 5001 } } : row);
    mocks.observation.findMany.mockResolvedValue(changed);
    const previous = [...new Set(rows.map(r => r.testType))].map(type => ({
      id: `result-${type}`, testType: type, rulesetVersionId: 'r',
      evaluatedObservationFingerprint: logicalObservationFingerprint(rows.filter(r => r.testType === type)),
    }));
    expect(assessResultFreshness(changed, previous, 'r')[0].state).toBe('STALE');
    mocks.result.findMany.mockResolvedValueOnce(previous).mockResolvedValueOnce([]);
    await evaluateSavedSession('s');
    expect(mocks.result.create).not.toHaveBeenCalled();
    const writes = mocks.result.update.mock.calls.map(([arg]) => arg.data);
    const freshness = assessResultFreshness(changed, writes, 'r');
    expect(writes).toHaveLength(4);
    expect(writes.every(w => freshness.find(item => item.testType === w.testType)?.state === 'CURRENT')).toBe(true);
  });

  it('rejects a changed client snapshot before running or persisting an evaluation', async () => {
    await expect(evaluateSavedSession('s', { observations: { forged: true } }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.result.create).not.toHaveBeenCalled();
  });

  it('accepts a matching UI snapshot', async () => {
    await expect(evaluateSavedSession('s', f)).resolves.toHaveProperty('overallOutcome');
  });

  it('blocks duplicate observation rows', async () => {
    mocks.observation.findMany.mockResolvedValue([...rows, rows[0]]);
    await expect(evaluateSavedSession('s')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.result.create).not.toHaveBeenCalled();
  });

  it('blocks duplicate logical results', async () => {
    mocks.result.findMany.mockResolvedValue([{ testType: rows[0].testType }, { testType: rows[0].testType }]);
    await expect(evaluateSavedSession('s')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('does not fabricate results for missing observations', async () => {
    mocks.observation.findMany.mockResolvedValue([]);
    const result = await evaluateSavedSession('s');
    expect(result.counts.incomplete).toBe(4);
    expect(mocks.result.create).not.toHaveBeenCalled();
  });

  it('evaluates INITIAL_VERIFICATION session where Discrimination and Zero-Setting are NOT APPLICABLE', async () => {
    // Setup instrument without zero-setting mechanisms and initial verification context
    mocks.session.findUnique.mockResolvedValue({
      id: 'session-initial',
      rulesetVersionId: 'r',
      verificationContext: 'INITIAL_VERIFICATION',
      instrument: {
        ...f.instrument,
        instrumentType: 'SINGLE_RANGE',
        indicationType: null,
        zeroSettingMechanisms: [],
        numberOfSupportPoints: 4,
        max: 30,
        min: 0.2,
        e: 0.01,
        d: 0.005,
        manufacturer: { name: 'TestMfg' },
      },
    });

    // Only applicable test observations are present (Weighing, Repeatability, Eccentric) with valid zeros
    const initialWeighingLoads = [0.2, 5, 10, 20, 30];
    const initialWeighingObs = [
      ...initialWeighingLoads.map((load, idx) => ({
        sequenceIndex: idx,
        load,
        indicatedValue: load,
        additionalLoad: 0.005,
        zeroError: 0,
        loadingDirection: 'increasing' as const,
      })),
      ...[...initialWeighingLoads].reverse().map((load, idx) => ({
        sequenceIndex: initialWeighingLoads.length + idx,
        load,
        indicatedValue: load,
        additionalLoad: 0.005,
        zeroError: 0,
        loadingDirection: 'decreasing' as const,
      })),
    ];

    const initialRows = [
      ...initialWeighingObs.map((obs, idx) => ({
        id: `obs-w-${idx}`,
        sessionId: 'session-initial',
        testType: 'WEIGHING_PERFORMANCE',
        sequenceIndex: idx,
        observationData: obs,
      })),
      {
        id: 'obs-r',
        sessionId: 'session-initial',
        testType: 'REPEATABILITY',
        sequenceIndex: 0,
        observationData: {
          testLoad: 10,
          indications: [10, 10, 10],
          autoZeroOrTrackingActive: true,
        },
      },
      ...[1, 2, 3, 4].map((pos) => ({
        id: `obs-e-${pos}`,
        sessionId: 'session-initial',
        testType: 'ECCENTRIC_LOADING',
        sequenceIndex: pos - 1,
        observationData: {
          positionId: `position-${pos}`,
          appliedLoad: 10,
          indicatedValue: 10,
          additionalLoad: 0.005,
          zeroError: 0,
          autoZeroOrTrackingDisabled: true,
          zeroDeterminedBeforeEachLoading: false,
        },
      })),
    ];

    mocks.observation.findMany.mockResolvedValue(initialRows);

    // Matching UI snapshot: Discrimination is excluded as [], Zero-Setting as undefined
    const expectedSnapshot = {
      instrument: {
        id: f.instrument.id,
        manufacturer: 'TestMfg',
        model: f.instrument.model,
        serialNumber: undefined,
        accuracyClass: f.instrument.accuracyClass,
        max: 30,
        min: 0.2,
        e: 0.01,
        d: 0.005,
        numberOfSupportPoints: 4,
        additiveTareEffect: false,
        hasAutoZeroOrTracking: false,
        hasInitialZeroSettingDevice: false,
        initialZeroSettingRange: 0,
        hasFineDisplayDevice: false,
        instrumentType: 'single_range',
        indicationType: undefined,
        zeroSettingMechanisms: [],
      },
      verificationContext: 'initial_verification',
      observations: {
        weighingPerformance: initialWeighingObs,
        repeatability: {
          testLoad: 10,
          indications: [10, 10, 10],
          autoZeroOrTrackingActive: true,
        },
        eccentricLoading: [1, 2, 3, 4].map((pos) => ({
          positionId: `position-${pos}`,
          appliedLoad: 10,
          indicatedValue: 10,
          additionalLoad: 0.005,
          zeroError: 0,
          autoZeroOrTrackingDisabled: true,
        })),
        eccentricZeroDeterminedBeforeEachLoading: false,
        discrimination: [],
        zeroSettingAccuracy: undefined,
      },
    };

    const response = await evaluateSavedSession('session-initial', expectedSnapshot);
    expect(response.overallOutcome).toBe('pass');
    expect(response.evaluatedTests).toHaveLength(5);

    const weighingTest = response.evaluatedTests.find(t => t.testType === 'weighing_performance');
    expect(weighingTest?.status).toBe('passed');

    const repeatabilityTest = response.evaluatedTests.find(t => t.testType === 'repeatability');
    expect(repeatabilityTest?.status).toBe('passed');

    const eccentricTest = response.evaluatedTests.find(t => t.testType === 'eccentric_loading');
    expect(eccentricTest?.status).toBe('passed');

    const discriminationTest = response.evaluatedTests.find(t => t.testType === 'discrimination');
    expect(discriminationTest?.status).toBe('skipped');

    const zeroSettingTest = response.evaluatedTests.find(t => t.testType === 'zero_setting_accuracy');
    expect(zeroSettingTest?.status).toBe('skipped');
  });

  it('rejects an overall pass and returns incomplete when eccentric positions are incomplete for a 4-point instrument', async () => {
    mocks.session.findUnique.mockResolvedValue({
      id: 'session-incomplete-ecc',
      rulesetVersionId: 'r',
      verificationContext: 'INITIAL_VERIFICATION',
      instrument: {
        ...f.instrument,
        instrumentType: 'SINGLE_RANGE',
        indicationType: null,
        zeroSettingMechanisms: [],
        numberOfSupportPoints: 4,
        max: 30,
        min: 0.2,
        e: 0.01,
        d: 0.005,
        manufacturer: { name: 'TestMfg' },
      },
    });

    mocks.observation.findMany.mockResolvedValue([
      {
        id: 'obs-w',
        sessionId: 'session-incomplete-ecc',
        testType: 'WEIGHING_PERFORMANCE',
        sequenceIndex: 0,
        observationData: { sequenceIndex: 0, load: 10, indicatedValue: 10, additionalLoad: 0, zeroError: 0, loadingDirection: 'increasing' },
      },
      {
        id: 'obs-r',
        sessionId: 'session-incomplete-ecc',
        testType: 'REPEATABILITY',
        sequenceIndex: 0,
        observationData: { testLoad: 10, indications: [10, 10, 10], autoZeroOrTrackingActive: true },
      },
      {
        id: 'obs-e',
        sessionId: 'session-incomplete-ecc',
        testType: 'ECCENTRIC_LOADING',
        sequenceIndex: 0,
        observationData: { positionId: 'position-1', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0, zeroError: 0, autoZeroOrTrackingDisabled: true },
      },
    ]);

    const response = await evaluateSavedSession('session-incomplete-ecc');
    expect(response.overallOutcome).toBe('incomplete');
    const eccentricTest = response.evaluatedTests.find(t => t.testType === 'eccentric_loading');
    expect(eccentricTest?.status).toBe('incomplete');
    expect(eccentricTest?.errorMessage).toContain('Missing 3 required position(s)');
  });

  it('maps concurrent snapshot failure to a safe conflict', async () => {
    mocks.transaction.mockRejectedValue({ code: 'P2034', message: 'Private database details' });
    await expect(evaluateSavedSession('s')).rejects.toMatchObject({
      code: 'CONFLICT', message: 'Saved data changed concurrently; reload and retry',
    });
  });

  it('evaluates TYPE_EVALUATION session with SEMI_AUTOMATIC zero-setting and succeeds with valid observations', async () => {
    const instrumentData = {
      id: 'inst-zero-test',
      manufacturer: { name: 'TestMfg' },
      model: 'AVX-100',
      serialNumber: 'SN-001',
      accuracyClass: 'III',
      instrumentType: 'SINGLE_RANGE',
      max: '30',
      min: '0.2',
      e: '0.01',
      d: '0.005',
      numberOfSupportPoints: 4,
      additiveTareEffect: false,
      hasAutoZeroOrTracking: true,
      hasInitialZeroSettingDevice: true,
      initialZeroSettingRange: '0.04',
      hasFineDisplayDevice: false,
      indicationType: 'DIGITAL',
      zeroSettingMechanisms: ['SEMI_AUTOMATIC'],
    };

    mocks.session.findUnique.mockResolvedValue({
      id: 'session-zero-test',
      rulesetVersionId: 'r',
      verificationContext: 'TYPE_EVALUATION',
      instrument: instrumentData,
    });

    const typeLoads = [0.2, 1, 2, 5, 10, 15, 20, 25, 28, 30];
    const typeWeighingObs = [
      ...typeLoads.map((load, idx) => ({
        sequenceIndex: idx,
        load,
        indicatedValue: load,
        additionalLoad: 0.005,
        zeroError: 0,
        loadingDirection: 'increasing' as const,
      })),
      ...[...typeLoads].reverse().map((load, idx) => ({
        sequenceIndex: typeLoads.length + idx,
        load,
        indicatedValue: load,
        additionalLoad: 0.005,
        zeroError: 0,
        loadingDirection: 'decreasing' as const,
      })),
    ];

    const obsRows = [
      ...typeWeighingObs.map((obs, idx) => ({
        id: `obs-w-${idx}`,
        sessionId: 'session-zero-test',
        testType: 'WEIGHING_PERFORMANCE',
        sequenceIndex: idx,
        observationData: obs,
      })),
      {
        id: 'obs-r',
        sessionId: 'session-zero-test',
        testType: 'REPEATABILITY',
        sequenceIndex: typeWeighingObs.length,
        observationData: {
          series: [
            { seriesNumber: 1, testLoad: 15, indications: Array(10).fill(15) },
            { seriesNumber: 2, testLoad: 30, indications: Array(10).fill(30) },
          ],
          autoZeroOrTrackingActive: true,
        },
      },
      ...[1, 2, 3, 4].map((pos, idx) => ({
        id: `obs-e-${pos}`,
        sessionId: 'session-zero-test',
        testType: 'ECCENTRIC_LOADING',
        sequenceIndex: typeWeighingObs.length + 1 + idx,
        observationData: { positionId: `position-${pos}`, appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: true },
      })),
      ...[0.2, 15, 30].map((load, idx) => ({
        id: `obs-d-${idx}`,
        sessionId: 'session-zero-test',
        testType: 'DISCRIMINATION',
        sequenceIndex: typeWeighingObs.length + 5 + idx,
        observationData: { testLoad: load, indicationBefore: load, indicationAfter: Number((load + 0.005).toFixed(3)) },
      })),
      {
        id: 'obs-z',
        sessionId: 'session-zero-test',
        testType: 'ZERO_SETTING_ACCURACY',
        sequenceIndex: typeWeighingObs.length + 8,
        observationData: { load: 0.1, indicatedValue: 0.1, additionalLoad: 0.005 },
      },
    ];

    mocks.observation.findMany.mockResolvedValue(obsRows);
    mocks.result.findMany.mockResolvedValue([]);

    const expectedSnapshot = {
      instrument: {
        id: 'inst-zero-test',
        manufacturer: 'TestMfg',
        model: 'AVX-100',
        serialNumber: 'SN-001',
        accuracyClass: 'III',
        instrumentType: 'single_range',
        max: 30,
        min: 0.2,
        e: 0.01,
        d: 0.005,
        numberOfSupportPoints: 4,
        additiveTareEffect: false,
        hasAutoZeroOrTracking: true,
        hasInitialZeroSettingDevice: true,
        initialZeroSettingRange: 0.04,
        hasFineDisplayDevice: false,
        indicationType: 'digital',
        zeroSettingMechanisms: ['semi_automatic'],
      },
      verificationContext: 'type_evaluation',
      observations: {
        weighingPerformance: typeWeighingObs,
        repeatability: {
          series: [
            { seriesNumber: 1, testLoad: 15, indications: Array(10).fill(15) },
            { seriesNumber: 2, testLoad: 30, indications: Array(10).fill(30) },
          ],
          autoZeroOrTrackingActive: true,
        },
        eccentricLoading: [1, 2, 3, 4].map((pos) => ({
          positionId: `position-${pos}`,
          appliedLoad: 10,
          indicatedValue: 10,
          additionalLoad: 0.005,
          zeroError: 0,
          autoZeroOrTrackingDisabled: true,
        })),
        eccentricZeroDeterminedBeforeEachLoading: false,
        discrimination: [0.2, 15, 30].map(load => ({
          testLoad: load, indicationBefore: load, indicationAfter: Number((load + 0.005).toFixed(3)),
        })),
        zeroSettingAccuracy: {
          load: 0.1, indicatedValue: 0.1, additionalLoad: 0.005,
        },
      },
    };

    const response = await evaluateSavedSession('session-zero-test', expectedSnapshot);
    expect(response.overallOutcome).toBe('pass');
    expect(response.evaluatedTests).toHaveLength(5);

    const zeroTest = response.evaluatedTests.find(t => t.testType === 'zero_setting_accuracy');
    expect(zeroTest).toBeDefined();
    expect(zeroTest?.status).toBe('passed');
    expect(zeroTest?.result?.outcome).toBe('pass');
    expect(mocks.result.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          testType: 'ZERO_SETTING_ACCURACY',
          sessionId: 'session-zero-test',
        }),
      })
    );
  });
});
