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
  { testType: 'WEIGHING_PERFORMANCE', observationData: f.observations.weighingPerformance![0] },
  { testType: 'REPEATABILITY', observationData: f.observations.repeatability! },
  { testType: 'ECCENTRIC_LOADING', observationData: f.observations.eccentricLoading![0] },
].map((row, i) => ({ ...row, id: `o${i}`, sessionId: 's', sequenceIndex: 0 }));

describe('Saved-session evaluation integration unit tests (mocked Prisma, real engine)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(callback => callback({
      testSession: mocks.session, testObservation: mocks.observation, testResult: mocks.result,
    }));
    mocks.session.findUnique.mockResolvedValue({
      id: 's', rulesetVersionId: 'r', verificationContext: 'INITIAL_VERIFICATION',
      instrument: { ...f.instrument, instrumentType: 'SINGLE_RANGE',
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
      const payload = toTestResultPersistenceData(test)!;
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
    const previous = rows.map(row => ({
      id: `result-${row.testType}`, testType: row.testType, rulesetVersionId: 'r',
      evaluatedObservationFingerprint: logicalObservationFingerprint([row]),
    }));
    expect(assessResultFreshness(changed, previous, 'r')[0].state).toBe('STALE');
    mocks.result.findMany.mockResolvedValueOnce(previous).mockResolvedValueOnce([]);
    await evaluateSavedSession('s');
    expect(mocks.result.create).not.toHaveBeenCalled();
    const writes = mocks.result.update.mock.calls.map(([arg]) => arg.data);
    expect(assessResultFreshness(changed, writes, 'r').every(item => item.state === 'CURRENT')).toBe(true);
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
    expect(result.counts.incomplete).toBe(3);
    expect(mocks.result.create).not.toHaveBeenCalled();
  });

  it('maps concurrent snapshot failure to a safe conflict', async () => {
    mocks.transaction.mockRejectedValue({ code: 'P2034', message: 'Private database details' });
    await expect(evaluateSavedSession('s')).rejects.toMatchObject({
      code: 'CONFLICT', message: 'Saved data changed concurrently; reload and retry',
    });
  });
});
