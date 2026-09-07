import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { DatabaseConflictError, DatabaseNotFoundError, throwMappedDatabaseError } from '@/lib/db/errors';
import { evaluateInstrumentCompliance, type TestObservations } from '@/lib/r76/engine';
import { AccuracyClass, InstrumentType, VerificationContext, type Instrument } from '@/lib/r76/types';
import { toTestResultPersistenceData } from '@/components/Evaluation/result-persistence';
import { toTestResultRecord } from './test-result.service';
import { logicalObservationFingerprint, observationConflict, PROTOTYPE_TEST_TYPES } from './result-freshness.service';
import { validateTestObservationCreate } from '@/lib/validation/test-observation';
import { canonicalJson, instrumentConfigFingerprint } from '@/lib/db/observation-fingerprint';

interface ExpectedEvaluationInputs {
  instrument?: unknown;
  verificationContext?: unknown;
  observations?: unknown;
}

/** Captures saved inputs, evaluates them and writes certified results in one snapshot. */
export async function evaluateSavedSession(sessionId: string, expected: ExpectedEvaluationInputs = {}) {
  try {
    return await prisma.$transaction(async tx => {
      const session = await tx.testSession.findUnique({
        where: { id: sessionId }, include: { instrument: { include: { manufacturer: true } } },
      });
      if (!session) throw new DatabaseNotFoundError('TestSession not found');
      const [rows, previous] = await Promise.all([
        tx.testObservation.findMany({ where: { sessionId }, orderBy: { sequenceIndex: 'asc' } }),
        tx.testResult.findMany({ where: { sessionId } }),
      ]);
      for (const testType of PROTOTYPE_TEST_TYPES) {
        if (observationConflict(rows.filter(row => row.testType === testType), testType) ||
          previous.filter(row => row.testType === testType).length > 1) {
          throw new DatabaseConflictError(`${testType} has conflicting records; manual review is required`);
        }
      }
      for (const row of rows) {
        if (!validateTestObservationCreate(row).success) {
          throw new DatabaseConflictError('Saved observation structure is invalid; correct it before evaluation');
        }
      }
      const saved = session.instrument;
      if (saved.instrumentType !== 'SINGLE_RANGE') {
        throw new DatabaseConflictError('The prototype supports single-range instruments only');
      }
      // Numeric conversion occurs only at the existing engine boundary.
      const instrument: Instrument = {
        id: saved.id, manufacturer: saved.manufacturer.name, model: saved.model,
        serialNumber: saved.serialNumber ?? undefined,
        accuracyClass: saved.accuracyClass as AccuracyClass,
        instrumentType: InstrumentType.SingleRange,
        max: Number(saved.max), min: Number(saved.min), e: Number(saved.e), d: Number(saved.d),
        numberOfSupportPoints: saved.numberOfSupportPoints,
        additiveTareEffect: saved.additiveTareEffect,
        hasAutoZeroOrTracking: saved.hasAutoZeroOrTracking,
        hasInitialZeroSettingDevice: saved.hasInitialZeroSettingDevice,
        initialZeroSettingRange: Number(saved.initialZeroSettingRange),
        hasFineDisplayDevice: saved.hasFineDisplayDevice,
      };
      const context = {
        INITIAL_VERIFICATION: VerificationContext.InitialVerification,
        SUBSEQUENT_VERIFICATION: VerificationContext.SubsequentVerification,
        SERVICE_INSPECTION: VerificationContext.ServiceInspection,
      }[session.verificationContext];
      const dataFor = (type: string) => rows.filter(row => row.testType === type)
        .map(row => row.observationData);
      const pick = (data: unknown, fields: string[]) => Object.fromEntries(fields.map(field => [
        field, (data as Record<string, unknown>)[field] ?? (field === 'additionalLoad' ? 0 : undefined),
      ]));
      const observations: TestObservations = {
        weighingPerformance: dataFor('WEIGHING_PERFORMANCE').map(data => pick(data, [
          'sequenceIndex', 'load', 'indicatedValue', 'additionalLoad', 'zeroError', 'loadingDirection',
        ])) as unknown as TestObservations['weighingPerformance'],
        repeatability: dataFor('REPEATABILITY')[0] ? pick(dataFor('REPEATABILITY')[0], [
          'testLoad', 'indications', 'autoZeroOrTrackingActive',
        ]) as unknown as TestObservations['repeatability'] : undefined,
        eccentricLoading: dataFor('ECCENTRIC_LOADING').map(data => pick(data, [
          'positionId', 'appliedLoad', 'indicatedValue', 'additionalLoad', 'zeroError', 'autoZeroOrTrackingDisabled',
        ])) as unknown as TestObservations['eccentricLoading'],
        eccentricZeroDeterminedBeforeEachLoading: Boolean(
          (dataFor('ECCENTRIC_LOADING')[0] as Record<string, unknown> | undefined)?.zeroDeterminedBeforeEachLoading
        ),
      };
      // If a UI snapshot is supplied, reject unsaved edits or a concurrent browser's changes.
      const savedInputs = { instrument, verificationContext: context, observations };
      for (const key of ['instrument', 'verificationContext', 'observations'] as const) {
        if (expected[key] !== undefined && canonicalJson(expected[key]) !==
          canonicalJson(JSON.parse(JSON.stringify(savedInputs[key])))) {
          throw new DatabaseConflictError('Displayed inputs differ from saved data; save or reload before evaluation');
        }
      }
      const evaluation = evaluateInstrumentCompliance(instrument, context, observations);
      for (const test of evaluation.evaluatedTests) {
        const payload = toTestResultPersistenceData(test);
        if (!payload) continue;
        const data = {
          ...payload, sessionId, rulesetVersionId: session.rulesetVersionId,
          repeatabilityRange: payload.repeatabilityRange ?? null,
          complianceTrace: payload.complianceTrace as unknown as Prisma.InputJsonValue,
          evaluatedObservationFingerprint: logicalObservationFingerprint(
            rows.filter(row => row.testType === payload.testType)
          ),
          // Server-generated; client never supplies this value.
          evaluatedConfigFingerprint: instrumentConfigFingerprint(
            saved, session.verificationContext
          ),
        };
        const existing = previous.find(row => row.testType === payload.testType);
        if (existing) await tx.testResult.update({ where: { id: existing.id }, data });
        else await tx.testResult.create({ data });
      }
      const savedResults = await tx.testResult.findMany({ where: { sessionId } });
      return { ...evaluation, savedResults: savedResults.map(toTestResultRecord) };
    }, { isolationLevel: 'Serializable', timeout: 20000 });
  } catch (error) { throwMappedDatabaseError(error, 'TestResult'); }
}
