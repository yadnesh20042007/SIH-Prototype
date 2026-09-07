import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { observationFingerprint, instrumentConfigFingerprint } from '@/lib/db/observation-fingerprint';
import { DatabaseNotFoundError, throwMappedDatabaseError } from '@/lib/db/errors';

export const PROTOTYPE_TEST_TYPES = ['WEIGHING_PERFORMANCE', 'REPEATABILITY', 'ECCENTRIC_LOADING'] as const;
export type FreshnessState = 'CURRENT' | 'STALE' | 'MISSING' | 'CONFLICT';

export interface ObservationSnapshot {
  testType: string;
  sequenceIndex: number;
  observationData: unknown;
  observationFingerprint?: string | null;
}

export interface ResultSnapshot {
  testType: string;
  rulesetVersionId: string;
  evaluatedObservationFingerprint?: string | null;
  /** SHA-256 of the evaluation-relevant instrument config + verificationContext at evaluation time. */
  evaluatedConfigFingerprint?: string | null;
}

/**
 * Shape of the persisted Instrument fields needed to recompute the configuration fingerprint.
 * Matches the Pick<PrismaInstrument, …> used by instrumentConfigFingerprint().
 */
export interface InstrumentConfigForFreshness {
  accuracyClass: string;
  instrumentType: string;
  max: { toString(): string };
  min: { toString(): string };
  e: { toString(): string };
  d: { toString(): string };
  numberOfSupportPoints: number;
  additiveTareEffect: boolean;
  hasAutoZeroOrTracking: boolean;
  hasInitialZeroSettingDevice: boolean;
  initialZeroSettingRange: { toString(): string };
  hasFineDisplayDevice: boolean;
}

export function logicalObservationFingerprint(rows: ObservationSnapshot[]): string {
  return observationFingerprint(rows.slice().sort((a, b) => a.sequenceIndex - b.sequenceIndex)
    .map(row => ({ sequenceIndex: row.sequenceIndex, observationData: row.observationData })));
}

export function observationConflict(rows: ObservationSnapshot[], testType: string): boolean {
  if (new Set(rows.map(row => row.sequenceIndex)).size !== rows.length) return true;
  if (testType === 'REPEATABILITY' && rows.length > 1) return true;
  if (testType === 'ECCENTRIC_LOADING') {
    const data = rows.map(row => row.observationData as Record<string, unknown>);
    if (new Set(data.map(row => row.positionId)).size !== rows.length) return true;
    if (new Set(data.map(row => row.zeroDeterminedBeforeEachLoading ?? false)).size > 1) return true;
  }
  return rows.some(row => row.observationFingerprint != null &&
    row.observationFingerprint !== observationFingerprint(row.observationData));
}

/**
 * Recomputes freshness from actual persisted data; never trusts supplied fingerprints.
 *
 * A result is CURRENT only when ALL of:
 *   1. rulesetVersionId matches the session's current ruleset
 *   2. evaluatedObservationFingerprint matches the current persisted observation data
 *   3. evaluatedConfigFingerprint matches the current persisted instrument configuration
 *      (including verificationContext from the session)
 *
 * If currentConfigFingerprint is undefined (caller did not supply it — e.g. the
 * legacy freshness API path), condition 3 is skipped so old callers keep working.
 * The approval gate always supplies it, so the gate always enforces all three.
 */
export function assessResultFreshness(
  observations: ObservationSnapshot[],
  results: ResultSnapshot[],
  rulesetVersionId: string,
  currentConfigFingerprint?: string
) {
  return PROTOTYPE_TEST_TYPES.map(testType => {
    const rows = observations.filter(row => row.testType === testType);
    const matches = results.filter(row => row.testType === testType);
    let state: FreshnessState;

    if (matches.length > 1 || observationConflict(rows, testType)) {
      state = 'CONFLICT';
    } else if (!matches.length || !rows.length) {
      state = 'MISSING';
    } else {
      const result = matches[0];
      const observationMismatch =
        result.rulesetVersionId !== rulesetVersionId ||
        !result.evaluatedObservationFingerprint ||
        result.evaluatedObservationFingerprint !== logicalObservationFingerprint(rows);

      // Config fingerprint check: only enforce when current fingerprint is supplied
      // and the result already has a recorded config fingerprint.
      // A null evaluatedConfigFingerprint means the result predates config certification
      // → treat as STALE (legacy results must be re-evaluated).
      const configMismatch = currentConfigFingerprint !== undefined && (
        !result.evaluatedConfigFingerprint ||
        result.evaluatedConfigFingerprint !== currentConfigFingerprint
      );

      state = (observationMismatch || configMismatch) ? 'STALE' : 'CURRENT';
    }

    return {
      testType,
      state,
      evaluatedObservationFingerprint: matches.length === 1
        ? matches[0].evaluatedObservationFingerprint ?? null : null,
      evaluatedConfigFingerprint: matches.length === 1
        ? matches[0].evaluatedConfigFingerprint ?? null : null,
    };
  });
}

/** Full session freshness read — includes instrument config in fingerprint check. */
export async function readSessionResultFreshness(tx: Prisma.TransactionClient, sessionId: string) {
  const session = await tx.testSession.findUnique({
    where: { id: sessionId },
    include: { instrument: true },
  });
  if (!session) throw new DatabaseNotFoundError('TestSession not found');
  const [observations, results] = await Promise.all([
    tx.testObservation.findMany({ where: { sessionId } }),
    tx.testResult.findMany({ where: { sessionId } }),
  ]);
  const currentConfigFp = instrumentConfigFingerprint(
    session.instrument,
    session.verificationContext
  );
  return assessResultFreshness(observations, results, session.rulesetVersionId, currentConfigFp);
}

export async function getSessionResultFreshness(sessionId: string) {
  try {
    return await prisma.$transaction(tx => readSessionResultFreshness(tx, sessionId), {
      isolationLevel: 'RepeatableRead',
    });
  } catch (error) { throwMappedDatabaseError(error, 'TestResult'); }
}
