/**
 * Focused tests: instrument configuration fingerprint freshness
 *
 * These tests verify the extended CURRENT/STALE logic that now requires BOTH:
 *   1. evaluatedObservationFingerprint == current observation fingerprint
 *   2. evaluatedConfigFingerprint      == current instrument config fingerprint
 */
import { describe, expect, it } from 'vitest';
import {
  instrumentConfigFingerprint,
  instrumentConfigSnapshot,
  canonicalJson,
} from '@/lib/db/observation-fingerprint';
import {
  assessResultFreshness,
  logicalObservationFingerprint,
  type ObservationSnapshot,
} from './result-freshness.service';

// ── Shared fixtures ──────────────────────────────────────────────────────────

/** Minimal Prisma-Decimal-compatible instrument fixture. */
const mkInstrument = (overrides: Record<string, unknown> = {}) => ({
  accuracyClass: 'III',
  instrumentType: 'SINGLE_RANGE',
  max: { toString: () => '30' },
  min: { toString: () => '0.02' },
  e: { toString: () => '0.01' },
  d: { toString: () => '0.01' },
  numberOfSupportPoints: 4,
  additiveTareEffect: false,
  hasAutoZeroOrTracking: false,
  hasInitialZeroSettingDevice: false,
  initialZeroSettingRange: { toString: () => '0' },
  hasFineDisplayDevice: false,
  ...overrides,
});

const BASE_INSTRUMENT = mkInstrument();
const BASE_CONTEXT = 'INITIAL_VERIFICATION';

const currentConfigFp = () =>
  instrumentConfigFingerprint(
    BASE_INSTRUMENT as Parameters<typeof instrumentConfigFingerprint>[0],
    BASE_CONTEXT
  );

const observation: ObservationSnapshot = {
  testType: 'WEIGHING_PERFORMANCE',
  sequenceIndex: 0,
  observationData: { load: 10, indicatedValue: 10.005 },
};

const currentObsFp = logicalObservationFingerprint([observation]);

/** Build a result fixture for a single test type. */
const mkResult = (
  overrides: Partial<{
    evaluatedObservationFingerprint: string | null;
    evaluatedConfigFingerprint: string | null;
    rulesetVersionId: string;
  }> = {}
) => ({
  testType: 'WEIGHING_PERFORMANCE',
  rulesetVersionId: 'r',
  evaluatedObservationFingerprint: currentObsFp,
  evaluatedConfigFingerprint: currentConfigFp(),
  ...overrides,
});

/** Run assessResultFreshness for WEIGHING_PERFORMANCE only and return its state. */
const state = (
  results: ReturnType<typeof mkResult>[],
  cfp: string | undefined = currentConfigFp()
) =>
  assessResultFreshness([observation], results, 'r', cfp)[0].state;

// ── Configuration fingerprint unit tests ─────────────────────────────────────

describe('instrumentConfigFingerprint', () => {
  it('produces a 64-char hex string', () => {
    expect(currentConfigFp()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same inputs always produce the same hash', () => {
    expect(currentConfigFp()).toBe(currentConfigFp());
  });

  it('is stable across object key ordering (canonicalization)', () => {
    // instrumentConfigSnapshot already sorts keys via canonicalJson
    const snap1 = instrumentConfigSnapshot(
      BASE_INSTRUMENT as Parameters<typeof instrumentConfigSnapshot>[0],
      BASE_CONTEXT
    );
    // Build a reversed-key object of the snapshot
    const reversed = Object.fromEntries(Object.entries(snap1).reverse());
    expect(canonicalJson(snap1)).toBe(canonicalJson(reversed));
  });

  it('changes when accuracyClass changes', () => {
    const altered = mkInstrument({ accuracyClass: 'II' });
    expect(
      instrumentConfigFingerprint(
        altered as Parameters<typeof instrumentConfigFingerprint>[0],
        BASE_CONTEXT
      )
    ).not.toBe(currentConfigFp());
  });

  it('changes when e changes', () => {
    const altered = mkInstrument({ e: { toString: () => '0.005' } });
    expect(
      instrumentConfigFingerprint(
        altered as Parameters<typeof instrumentConfigFingerprint>[0],
        BASE_CONTEXT
      )
    ).not.toBe(currentConfigFp());
  });

  it('changes when max changes', () => {
    const altered = mkInstrument({ max: { toString: () => '60' } });
    expect(
      instrumentConfigFingerprint(
        altered as Parameters<typeof instrumentConfigFingerprint>[0],
        BASE_CONTEXT
      )
    ).not.toBe(currentConfigFp());
  });

  it('changes when min changes', () => {
    const altered = mkInstrument({ min: { toString: () => '0.1' } });
    expect(
      instrumentConfigFingerprint(
        altered as Parameters<typeof instrumentConfigFingerprint>[0],
        BASE_CONTEXT
      )
    ).not.toBe(currentConfigFp());
  });

  it('changes when d changes', () => {
    const altered = mkInstrument({ d: { toString: () => '0.001' } });
    expect(
      instrumentConfigFingerprint(
        altered as Parameters<typeof instrumentConfigFingerprint>[0],
        BASE_CONTEXT
      )
    ).not.toBe(currentConfigFp());
  });

  it('changes when numberOfSupportPoints changes', () => {
    const altered = mkInstrument({ numberOfSupportPoints: 3 });
    expect(
      instrumentConfigFingerprint(
        altered as Parameters<typeof instrumentConfigFingerprint>[0],
        BASE_CONTEXT
      )
    ).not.toBe(currentConfigFp());
  });

  it('changes when hasAutoZeroOrTracking changes', () => {
    const altered = mkInstrument({ hasAutoZeroOrTracking: true });
    expect(
      instrumentConfigFingerprint(
        altered as Parameters<typeof instrumentConfigFingerprint>[0],
        BASE_CONTEXT
      )
    ).not.toBe(currentConfigFp());
  });

  it('changes when verificationContext changes', () => {
    expect(
      instrumentConfigFingerprint(
        BASE_INSTRUMENT as Parameters<typeof instrumentConfigFingerprint>[0],
        'SUBSEQUENT_VERIFICATION'
      )
    ).not.toBe(currentConfigFp());
  });

  it('changes when instrumentType changes', () => {
    const altered = mkInstrument({ instrumentType: 'MULTI_RANGE' });
    expect(
      instrumentConfigFingerprint(
        altered as Parameters<typeof instrumentConfigFingerprint>[0],
        BASE_CONTEXT
      )
    ).not.toBe(currentConfigFp());
  });

  it('is stable when semantically identical Decimal toString values are used', () => {
    // '30' and '30.0' differ, but Prisma Decimal always uses a canonical form —
    // this test verifies that the same string representation produces the same fingerprint.
    const a = mkInstrument({ max: { toString: () => '30' } });
    const b = mkInstrument({ max: { toString: () => '30' } });
    expect(
      instrumentConfigFingerprint(
        a as Parameters<typeof instrumentConfigFingerprint>[0],
        BASE_CONTEXT
      )
    ).toBe(
      instrumentConfigFingerprint(
        b as Parameters<typeof instrumentConfigFingerprint>[0],
        BASE_CONTEXT
      )
    );
  });
});

// ── assessResultFreshness with config fingerprint ────────────────────────────

describe('assessResultFreshness with config fingerprint', () => {
  it('is CURRENT when both fingerprints match', () => {
    expect(state([mkResult()])).toBe('CURRENT');
  });

  it('is STALE when evaluatedConfigFingerprint is null (legacy / pre-migration result)', () => {
    expect(state([mkResult({ evaluatedConfigFingerprint: null })])).toBe('STALE');
  });

  it('is STALE when evaluatedConfigFingerprint is wrong (config changed after evaluation)', () => {
    expect(state([mkResult({ evaluatedConfigFingerprint: 'aaaa' + 'b'.repeat(60) })])).toBe('STALE');
  });

  it('is STALE when e changes (observation fingerprint unchanged)', () => {
    const alteredFp = instrumentConfigFingerprint(
      mkInstrument({ e: { toString: () => '0.005' } }) as Parameters<typeof instrumentConfigFingerprint>[0],
      BASE_CONTEXT
    );
    // currentConfigFp passed to assessResultFreshness reflects changed e
    expect(state([mkResult()], alteredFp)).toBe('STALE');
  });

  it('is STALE when accuracyClass changes (observation fingerprint unchanged)', () => {
    const alteredFp = instrumentConfigFingerprint(
      mkInstrument({ accuracyClass: 'II' }) as Parameters<typeof instrumentConfigFingerprint>[0],
      BASE_CONTEXT
    );
    expect(state([mkResult()], alteredFp)).toBe('STALE');
  });

  it('is STALE when verificationContext changes (observation fingerprint unchanged)', () => {
    const alteredFp = instrumentConfigFingerprint(
      BASE_INSTRUMENT as Parameters<typeof instrumentConfigFingerprint>[0],
      'SUBSEQUENT_VERIFICATION'
    );
    expect(state([mkResult()], alteredFp)).toBe('STALE');
  });

  it('is STALE when instrumentType changes (affects test applicability)', () => {
    const alteredFp = instrumentConfigFingerprint(
      mkInstrument({ instrumentType: 'MULTI_RANGE' }) as Parameters<typeof instrumentConfigFingerprint>[0],
      BASE_CONTEXT
    );
    expect(state([mkResult()], alteredFp)).toBe('STALE');
  });

  it('is STALE when numberOfSupportPoints changes (affects eccentric test applicability)', () => {
    const alteredFp = instrumentConfigFingerprint(
      mkInstrument({ numberOfSupportPoints: 5 }) as Parameters<typeof instrumentConfigFingerprint>[0],
      BASE_CONTEXT
    );
    expect(state([mkResult()], alteredFp)).toBe('STALE');
  });

  it('is CURRENT after re-evaluation captures the new config fingerprint', () => {
    const newFp = instrumentConfigFingerprint(
      mkInstrument({ accuracyClass: 'II' }) as Parameters<typeof instrumentConfigFingerprint>[0],
      BASE_CONTEXT
    );
    // Result now stores the new config fingerprint after re-evaluation.
    expect(state([mkResult({ evaluatedConfigFingerprint: newFp })], newFp)).toBe('CURRENT');
  });

  it('is STALE when observation changes even if config fingerprint matches', () => {
    const changedObsFp = logicalObservationFingerprint([
      { ...observation, observationData: { load: 99, indicatedValue: 99 } },
    ]);
    expect(
      state([mkResult({ evaluatedObservationFingerprint: changedObsFp })])
    ).toBe('STALE');
  });

  it('skips config check when currentConfigFingerprint is not supplied (legacy callers)', () => {
    // Without a currentConfigFp, only obs+ruleset freshness is checked.
    const result = mkResult({ evaluatedConfigFingerprint: null });
    const stateNoConfig = assessResultFreshness([observation], [result], 'r')[0].state;
    // evaluatedObservationFingerprint matches → CURRENT (legacy path)
    expect(stateNoConfig).toBe('CURRENT');
  });

  it('is MISSING when no result exists', () => {
    expect(state([])).toBe('MISSING');
  });

  it('is CONFLICT when duplicate results exist', () => {
    const res = mkResult();
    expect(assessResultFreshness([observation], [res, res], 'r', currentConfigFp())[0].state).toBe('CONFLICT');
  });
});
