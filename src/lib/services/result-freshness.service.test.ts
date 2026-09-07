import { describe, expect, it } from 'vitest';
import { observationFingerprint } from '@/lib/db/observation-fingerprint';
import { assessResultFreshness, logicalObservationFingerprint, type ObservationSnapshot } from './result-freshness.service';

const row: ObservationSnapshot = {
  testType: 'WEIGHING_PERFORMANCE', sequenceIndex: 0,
  observationData: { load: 10, indicatedValue: 10.01, details: { b: true, a: [1, 2] } },
};
const result = {
  testType: row.testType, rulesetVersionId: 'r',
  evaluatedObservationFingerprint: logicalObservationFingerprint([row]),
};
const state = (rows: ObservationSnapshot[], results = [result]) =>
  assessResultFreshness(rows, results, 'r')[0].state;

describe('Server observation fingerprints and result freshness', () => {
  it('canonicalizes nested object key ordering', () => {
    expect(observationFingerprint({ a: { y: 2, x: 1 }, b: true }))
      .toBe(observationFingerprint({ b: true, a: { x: 1, y: 2 } }));
  });
  it('preserves array order and primitive types', () => {
    expect(observationFingerprint([1, 2])).not.toBe(observationFingerprint([2, 1]));
    expect(observationFingerprint('1')).not.toBe(observationFingerprint(1));
  });
  it('rejects non-JSON input', () => {
    expect(() => observationFingerprint({ value: NaN })).toThrow();
  });
  it('marks identical persisted data current without browser evidence', () => {
    expect(state([row])).toBe('CURRENT');
  });
  it('keeps unchanged observation saves current', () => {
    expect(state([{ ...row, observationData: structuredClone(row.observationData) }])).toBe('CURRENT');
  });
  it('marks changed JSON stale regardless of timestamp', () => {
    expect(state([{ ...row, observationData: { load: 11 } }])).toBe('STALE');
  });
  it('restores current only with the fingerprint of newly evaluated data', () => {
    const changed = { ...row, observationData: { load: 11 } };
    expect(state([changed], [{ ...result,
      evaluatedObservationFingerprint: logicalObservationFingerprint([changed]),
    }])).toBe('CURRENT');
  });
  it('marks a missing result missing', () => expect(state([row], [])).toBe('MISSING'));
  it('marks missing observations missing', () => expect(state([])).toBe('MISSING'));
  it('does not certify legacy results', () => {
    expect(state([row], [{ ...result, evaluatedObservationFingerprint: '' }])).toBe('STALE');
  });
  it('reports duplicate results as a conflict', () => {
    expect(state([row], [result, result])).toBe('CONFLICT');
  });
  it('reports duplicate logical row indexes as a conflict', () => {
    expect(state([row, row])).toBe('CONFLICT');
  });
  it('allows multiple distinct weighing rows and fingerprints their full ordered set', () => {
    const second = { ...row, sequenceIndex: 1, observationData: { load: 20 } };
    expect(logicalObservationFingerprint([row, second])).toBe(logicalObservationFingerprint([second, row]));
    expect(state([row, second])).toBe('STALE');
  });
  it('detects duplicate eccentric positions and repeatability records', () => {
    const rows = [0, 1].map(sequenceIndex => ({
      sequenceIndex, testType: 'ECCENTRIC_LOADING', observationData: { positionId: 'centre' },
    }));
    expect(assessResultFreshness(rows, [], 'r')[2].state).toBe('CONFLICT');
    expect(assessResultFreshness(rows.map(row => ({ ...row, testType: 'REPEATABILITY' })), [], 'r')[1].state)
      .toBe('CONFLICT');
  });
  it('treats ordering metadata as significant', () => {
    expect(state([{ ...row, sequenceIndex: 1 }])).toBe('STALE');
  });
  it('rejects a corrupted stored observation fingerprint', () => {
    expect(state([{ ...row, observationFingerprint: 'forged' }])).toBe('CONFLICT');
  });
});
