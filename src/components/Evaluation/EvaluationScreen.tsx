'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  IndicationType,
  InstrumentType,
  VerificationContext,
  type Instrument,
} from '@/lib/r76/types';
import { selectTests, type TestSelectionResult } from '@/lib/r76/test-selection';
import { TestType } from '@/lib/r76/types';

import type {
  TestObservations,
  OrchestrationResult,
} from '@/lib/r76/engine';

import { InstrumentSection } from './InstrumentSection';
import { WeighingPerformanceSection } from './WeighingPerformanceSection';
import { validateWeighingLoadInput } from '@/lib/r76/calculations/weighing';
import { RepeatabilitySection } from './RepeatabilitySection';
import { EccentricLoadingSection } from './EccentricLoadingSection';
import { DiscriminationSection } from './DiscriminationSection';
import { ZeroSettingSection } from './ZeroSettingSection';
import { ResultsSection } from './ResultsSection';
import { ReportActions } from '@/components/Reports/ReportActions';
import {
  type SavedTestResultResponse,
  type StoredTestType,
} from './result-persistence';

import {
  createDefaultInstrument,
  createDefaultRepeatability,
  createWeighingRow,
  createEccentricRow,
  createDiscriminationRow,
  createDefaultZeroSetting,
  generateRowId,
  parseNum,
  normalizeVerificationContext,
  getVerificationContextLabel,
  type InstrumentFormState,
  type WeighingRowState,
  type RepeatabilityFormState,
  type EccentricRowState,
  type DiscriminationRowState,
  type ZeroSettingFormState,
} from './types';

interface SavedInstrumentResponse {
  id: string;
  manufacturer: { name: string };
  model: string;
  serialNumber: string | null;
  accuracyClass: InstrumentFormState['accuracyClass'];
  instrumentType: InstrumentFormState['instrumentType'];
  indicationType?: 'DIGITAL' | 'ANALOG' | 'digital' | 'analog' | null;
  max: string;
  min: string;
  e: string;
  d: string;
  numberOfSupportPoints: number;
  additiveTareEffect: boolean;
  hasAutoZeroOrTracking: boolean;
  hasInitialZeroSettingDevice: boolean;
  initialZeroSettingRange: string;
  hasFineDisplayDevice: boolean;
  zeroSettingMechanisms: string[];
}

interface SavedTestSessionResponse {
  id: string;
  instrumentId: string;
  verificationContext:
    | 'TYPE_EVALUATION'
    | 'INITIAL_VERIFICATION'
    | 'SUBSEQUENT_VERIFICATION'
    | 'SERVICE_INSPECTION';
  status:
    | 'DRAFT'
    | 'IN_PROGRESS'
    | 'PENDING_REVIEW'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'RETURNED';
  rulesetVersionId: string;
}

interface SavedTestObservationResponse {
  id: string;
  sessionId: string;
  testType: 'WEIGHING_PERFORMANCE' | 'REPEATABILITY' | 'ECCENTRIC_LOADING' | 'DISCRIMINATION' | 'ZERO_SETTING_ACCURACY';
  sequenceIndex: number;
  observationData: Record<string, unknown>;
  createdAt: string;
}

interface ObservationIds {
  weighing: Record<string, string>;
  repeatability: string | null;
  eccentric: Record<string, string>;
  discrimination: Record<string, string>;
  zeroSetting: string | null;
}

const EMPTY_OBSERVATION_IDS: ObservationIds = {
  weighing: {},
  repeatability: null,
  eccentric: {},
  discrimination: {},
  zeroSetting: null,
};

interface EvaluationScreenProps {
  instrumentId: string;
  sessionId: string;
}

const VERIFICATION_CONTEXT_BY_SESSION = {
  TYPE_EVALUATION: VerificationContext.TypeEvaluation,
  INITIAL_VERIFICATION: VerificationContext.InitialVerification,
  SUBSEQUENT_VERIFICATION: VerificationContext.SubsequentVerification,
  SERVICE_INSPECTION: VerificationContext.ServiceInspection,
} as const;

function observationError(payload: unknown, status: number): string {
  if (typeof payload === 'object' && payload !== null && 'errors' in payload && Array.isArray(payload.errors)) {
    const messages = payload.errors.map((item) => {
      if (typeof item !== 'object' || item === null) return null;
      const field = 'field' in item ? item.field : null;
      const message = 'message' in item ? item.message : null;
      return typeof field === 'string' && typeof message === 'string' ? `${field}: ${message}` : null;
    }).filter(Boolean);
    if (messages.length > 0) return messages.join('; ');
  }
  if (typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string') {
    return payload.error;
  }
  return `Request failed with status ${status}.`;
}

async function persistObservation(
  id: string | undefined,
  data: Record<string, unknown>
): Promise<SavedTestObservationResponse> {
  const response = await fetch(
    id ? `/api/test-observations/${encodeURIComponent(id)}` : '/api/test-observations',
    {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(observationError(payload, response.status));
  return payload as SavedTestObservationResponse;
}

async function deletePersistedObservation(id: string): Promise<void> {
  const response = await fetch(`/api/test-observations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(observationError(payload, response.status));
  }
}

async function fetchFreshness(sessionId: string): Promise<{
  testType: StoredTestType; state: string; evaluatedObservationFingerprint: string | null;
}[]> {
    const response = await fetch(`/api/test-results/freshness?testSessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(observationError(payload, response.status));
    return payload;
  }


/**
 * Shown in place of a test-entry section when the test-selection engine
 * has determined that the test does not apply to the current instrument.
 * Displays the engine's reason and R76 reference so the technician
 * understands why the section is absent.
 */
function NotApplicableBanner({
  testName,
  reason,
  r76Reference,
}: {
  testName: string;
  reason: string;
  r76Reference?: string;
}) {
  return (
    <div
      role="note"
      aria-label={`${testName} not applicable`}
      className="rounded-[5px] border border-[#D9E2EC] bg-[#F9FBFC] px-4 py-3 text-[0.76rem] text-[#344054]"
    >
      <span className="font-bold text-[#344054]">{testName}</span>
      <span className="ml-2 rounded-full bg-[#E5E7EB] px-2 py-0.5 text-[0.66rem] font-bold uppercase tracking-[0.07em] text-[#667085]">
        Not applicable
      </span>
      <p className="mt-1.5 text-[0.73rem] text-[#667085]">{reason}</p>
      {r76Reference && (
        <p className="mt-0.5 text-[0.68rem] text-[#98A2B3]">
          Reference: {r76Reference}
        </p>
      )}
    </div>
  );
}

export function EvaluationScreen({ instrumentId, sessionId }: EvaluationScreenProps) {

  const configurationEdited = useRef(false);

  const [instrument, setInstrument] =
    useState<InstrumentFormState>(
      createDefaultInstrument()
    );

  const [
    verificationContext,
    setVerificationContext,
  ] = useState<VerificationContext>(
    VerificationContext.InitialVerification
  );

  const [weighingRows, setWeighingRows] =
    useState<WeighingRowState[]>(() => [
      createWeighingRow(),
    ]);

  const [repeatability, setRepeatability] =
    useState<RepeatabilityFormState>(
      createDefaultRepeatability()
    );

  const [eccentricRows, setEccentricRows] =
    useState<EccentricRowState[]>(() => [
      createEccentricRow(
        undefined,
        'position-1'
      ),
    ]);

  const [discriminationRows, setDiscriminationRows] =
    useState<DiscriminationRowState[]>(() => [
      createDiscriminationRow(undefined, ''),
    ]);

  const [zeroSetting, setZeroSetting] =
    useState<ZeroSettingFormState>(
      createDefaultZeroSetting()
    );

  const [
    eccentricZeroDetermined,
    setEccentricZeroDetermined,
  ] = useState(false);

  const [result, setResult] =
    useState<OrchestrationResult | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [instrumentLoading, setInstrumentLoading] = useState(true);
  const [instrumentLoadError, setInstrumentLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<SavedTestSessionResponse | null>(null);
  const [observationIds, setObservationIds] = useState<ObservationIds>(EMPTY_OBSERVATION_IDS);
  const [savingObservations, setSavingObservations] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    tone: 'error' | 'success';
    text: string;
  } | null>(null);
  const [savedResults, setSavedResults] = useState<SavedTestResultResponse[]>([]);
  const persistingResults = false;
  const [resultPersistenceMessage, setResultPersistenceMessage] = useState<{
    tone: 'error' | 'success';
    text: string;
  } | null>(null);
  const [resultIntegrityError, setResultIntegrityError] = useState<string | null>(null);
  const [resultsStale, setResultsStale] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [approvals, setApprovals] = useState<Array<{ id: string, action: string, comments: string | null, createdAt: string, user: { name: string, role: string } }>>([]);
  const [workflowMessage, setWorkflowMessage] = useState<{
    tone: 'error' | 'success';
    text: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadWorkspace() {
      configurationEdited.current = false;
      setInstrumentLoading(true);
      setInstrumentLoadError(null);
      try {
        if (!sessionId) {
          throw new Error('A valid test session is required to open the evaluation workspace.');
        }

        const [instrumentResponse, sessionResponse, observationsResponse, resultsResponse, approvalsResponse] = await Promise.all([
          fetch(`/api/instruments/${encodeURIComponent(instrumentId)}`, {
            signal: controller.signal,
          }),
          fetch(`/api/test-sessions/${encodeURIComponent(sessionId)}`, {
            signal: controller.signal,
          }),
          fetch(`/api/test-observations?testSessionId=${encodeURIComponent(sessionId)}`, {
            signal: controller.signal,
          }),
          fetch(`/api/test-results?testSessionId=${encodeURIComponent(sessionId)}`, {
            signal: controller.signal,
          }),
          fetch(`/api/approvals?testSessionId=${encodeURIComponent(sessionId)}`, {
            signal: controller.signal,
          }),
        ]);
        const data = (await instrumentResponse.json()) as SavedInstrumentResponse & {
          error?: string;
        };
        const sessionData = (await sessionResponse.json()) as SavedTestSessionResponse & {
          error?: string;
        };
        const observationsData = await observationsResponse.json();
        const resultsData = await resultsResponse.json();
        const approvalsData = await approvalsResponse.json();
        if (!instrumentResponse.ok) {
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : 'Unable to load the registered instrument.'
          );
        }
        if (!sessionResponse.ok) {
          throw new Error(
            typeof sessionData.error === 'string'
              ? sessionData.error
              : 'Unable to load the test session.'
          );
        }
        if (!observationsResponse.ok) {
          throw new Error(observationError(observationsData, observationsResponse.status));
        }
        if (!resultsResponse.ok) {
          throw new Error(observationError(resultsData, resultsResponse.status));
        }
        if (!approvalsResponse.ok) {
          throw new Error(observationError(approvalsData, approvalsResponse.status));
        }
        if (sessionData.instrumentId !== instrumentId) {
          throw new Error('This test session does not belong to the selected instrument.');
        }

        setInstrument({
          id: data.id,
          manufacturer: data.manufacturer.name,
          model: data.model,
          serialNumber: data.serialNumber ?? '',
          accuracyClass: data.accuracyClass,
          instrumentType: data.instrumentType,
          indicationType: data.indicationType ?? undefined,
          max: data.max,
          min: data.min,
          e: data.e,
          d: data.d,
          numberOfSupportPoints: String(data.numberOfSupportPoints),
          additiveTareEffect: data.additiveTareEffect,
          hasAutoZeroOrTracking: data.hasAutoZeroOrTracking,
          hasInitialZeroSettingDevice: data.hasInitialZeroSettingDevice,
          initialZeroSettingRange: data.initialZeroSettingRange,
          hasFineDisplayDevice: data.hasFineDisplayDevice,
          zeroSettingMechanisms: data.zeroSettingMechanisms ?? [],
        });
        setSession(sessionData);
        setVerificationContext(
          normalizeVerificationContext(sessionData.verificationContext)
        );
        const observations = observationsData as SavedTestObservationResponse[];
        const weighing = observations.filter(({ testType }) => testType === 'WEIGHING_PERFORMANCE');
        const repeatabilityRecords = observations.filter(({ testType }) => testType === 'REPEATABILITY');
        const eccentric = observations.filter(({ testType }) => testType === 'ECCENTRIC_LOADING');
        const discrimination = observations.filter(({ testType }) => testType === 'DISCRIMINATION');
        const zeroSettingRecords = observations.filter(({ testType }) => testType === 'ZERO_SETTING_ACCURACY');
        if (new Set(weighing.map(({ sequenceIndex }) => sequenceIndex)).size !== weighing.length) {
          throw new Error('Conflicting weighing observations require manual review.');
        }
        if (repeatabilityRecords.length > 1) {
          throw new Error('Conflicting repeatability observations require manual review.');
        }
        const eccentricSequenceIndexes = eccentric.map(({ sequenceIndex }) => sequenceIndex);
        const eccentricPositionIds = eccentric.map(({ observationData }) =>
          String(observationData.positionId)
        );
        if (
          new Set(eccentricSequenceIndexes).size !== eccentricSequenceIndexes.length ||
          new Set(eccentricPositionIds).size !== eccentricPositionIds.length
        ) {
          throw new Error('Conflicting eccentric-loading observations require manual review.');
        }

        const loadedIds: ObservationIds = { weighing: {}, repeatability: null, eccentric: {}, discrimination: {}, zeroSetting: null };
        const loadedWeighing = weighing.map((record) => {
          const rowId = `w-${record.id}`;
          loadedIds.weighing[rowId] = record.id;
          return {
            id: rowId,
            load: String(record.observationData.load),
            indicatedValue: String(record.observationData.indicatedValue),
            additionalLoad: String(record.observationData.additionalLoad ?? 0),
            zeroError: String(record.observationData.zeroError),
            loadingDirection: record.observationData.loadingDirection as WeighingRowState['loadingDirection'],
          };
        });
        const repeatabilityRecord = repeatabilityRecords[0];
        const loadedRepeatability = repeatabilityRecord
          ? {
              testLoad: String(repeatabilityRecord.observationData.testLoad ?? ''),
              indications: Array.isArray(repeatabilityRecord.observationData.indications)
                ? (repeatabilityRecord.observationData.indications as number[]).map(String)
                : ['', '', ''],
              autoZeroOrTrackingActive: Boolean(
                repeatabilityRecord.observationData.autoZeroOrTrackingActive
              ),
              ...(Array.isArray(repeatabilityRecord.observationData.series)
                ? {
                    series: (
                      repeatabilityRecord.observationData.series as Array<{
                        seriesNumber: number;
                        testLoad: number;
                        indications: number[];
                      }>
                    ).map((s) => ({
                      seriesNumber: s.seriesNumber,
                      testLoad: String(s.testLoad),
                      indications: Array.isArray(s.indications) ? s.indications.map(String) : [],
                    })),
                  }
                : {}),
            }
          : createDefaultRepeatability();
        if (repeatabilityRecord) loadedIds.repeatability = repeatabilityRecord.id;
        const loadedEccentric = eccentric.map((record) => {
          const rowId = `e-${record.id}`;
          loadedIds.eccentric[rowId] = record.id;
          return {
            id: rowId,
            positionId: String(record.observationData.positionId),
            appliedLoad: String(record.observationData.appliedLoad),
            indicatedValue: String(record.observationData.indicatedValue),
            additionalLoad: String(record.observationData.additionalLoad ?? 0),
            zeroError: String(record.observationData.zeroError),
            autoZeroOrTrackingDisabled: Boolean(
              record.observationData.autoZeroOrTrackingDisabled
            ),
          };
        });
        const loadedDiscrimination = discrimination.map((record) => {
          const rowId = `d-${record.id}`;
          loadedIds.discrimination[rowId] = record.id;
          return {
            id: rowId,
            testLoad: String(record.observationData.testLoad),
            indicationBefore: String(record.observationData.indicationBefore),
            indicationAfter: String(record.observationData.indicationAfter),
          };
        });
        const zeroSettingRecord = zeroSettingRecords[0];
        const loadedZeroSetting = zeroSettingRecord
          ? {
              load: String(zeroSettingRecord.observationData.load),
              indicatedValue: String(zeroSettingRecord.observationData.indicatedValue),
              additionalLoad: String(zeroSettingRecord.observationData.additionalLoad ?? 0),
            }
          : createDefaultZeroSetting();
        if (zeroSettingRecord) loadedIds.zeroSetting = zeroSettingRecord.id;

        setWeighingRows(loadedWeighing.length ? loadedWeighing : [createWeighingRow()]);
        setRepeatability(loadedRepeatability);
        setEccentricRows(loadedEccentric.length ? loadedEccentric : [createEccentricRow(undefined, 'position-1')]);
        setDiscriminationRows(loadedDiscrimination.length ? loadedDiscrimination : [createDiscriminationRow(undefined, '')]);
        setZeroSetting(loadedZeroSetting);
        setObservationIds(loadedIds);
        const storedResults = resultsData as SavedTestResultResponse[];
        const resultCounts = new Map<StoredTestType, number>();
        for (const storedResult of storedResults) {
          if (storedResult.sessionId !== sessionId) {
            throw new Error('A persisted result does not belong to the selected test session.');
          }
          resultCounts.set(storedResult.testType, (resultCounts.get(storedResult.testType) ?? 0) + 1);
        }
        const duplicateTypes = [...resultCounts.entries()]
          .filter(([, count]) => count > 1)
          .map(([testType]) => testType.replaceAll('_', ' '));
        if (duplicateTypes.length > 0) {
          setResultIntegrityError(
            `Multiple persisted results exist for ${duplicateTypes.join(', ')}. Manual review is required before re-evaluation.`
          );
          setSavedResults([]);
          setResultsStale(true);
        } else {
          setResultIntegrityError(null);
          setSavedResults(storedResults);
          const freshness = await fetchFreshness(sessionId);
          setResultsStale(storedResults.some(record =>
            !freshness.some(item => item.testType === record.testType && item.state === 'CURRENT' &&
              item.evaluatedObservationFingerprint === record.evaluatedObservationFingerprint)
          ));
        }
        setApprovals(approvalsData);
        setEccentricZeroDetermined(Boolean(eccentric[0]?.observationData.zeroDeterminedBeforeEachLoading));
        setResult(null);
        setError(null);
        setSaveMessage(null);
        setResultPersistenceMessage(null);
        setWorkflowMessage(null);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setInstrumentLoadError(
          loadError instanceof Error ? loadError.message : 'Unable to load the evaluation workspace.'
        );
      } finally {
        if (!controller.signal.aborted) setInstrumentLoading(false);
      }
    }

    void loadWorkspace();
    return () => controller.abort();
  }, [instrumentId, sessionId]);

  async function saveProgress(): Promise<{ success: boolean; error?: string }> {
    setSavingObservations(true);
    setSaveMessage(null);
    const nextIds: ObservationIds = {
      weighing: { ...observationIds.weighing },
      repeatability: observationIds.repeatability,
      eccentric: { ...observationIds.eccentric },
      discrimination: { ...observationIds.discrimination },
      zeroSetting: observationIds.zeroSetting,
    };
    let savedCount = 0;

    try {
      // Delete any removed weighing observations from backend
      for (const [rowId, dbId] of Object.entries(nextIds.weighing)) {
        if (!weighingRows.some((row) => row.id === rowId)) {
          await deletePersistedObservation(dbId);
          delete nextIds.weighing[rowId];
        }
      }

      // Delete any removed eccentric observations from backend
      for (const [rowId, dbId] of Object.entries(nextIds.eccentric)) {
        if (!eccentricRows.some((row) => row.id === rowId)) {
          await deletePersistedObservation(dbId);
          delete nextIds.eccentric[rowId];
        }
      }

      // Delete any removed discrimination observations from backend
      for (const [rowId, dbId] of Object.entries(nextIds.discrimination)) {
        if (!discriminationRows.some((row) => row.id === rowId)) {
          await deletePersistedObservation(dbId);
          delete nextIds.discrimination[rowId];
        }
      }
      for (const [index, row] of weighingRows.entries()) {
        if (row.load.trim() === '' && row.indicatedValue.trim() === '') {
          if (nextIds.weighing[row.id]) throw new Error('A saved weighing row cannot be cleared; restore its values before saving.');
          continue;
        }
        const loadVal = validateWeighingLoadInput(row.load, {
          min: Number(instrument.min) || undefined,
          max: Number(instrument.max) || undefined,
        });
        if (!loadVal.isValid) {
          throw new Error(`Weighing performance observation ${index + 1}: ${loadVal.error}`);
        }
        const observationData = {
          sequenceIndex: index,
          load: parseNum(row.load, `Weighing test load (row ${index + 1})`),
          indicatedValue: parseNum(row.indicatedValue, `Weighing indicated value (row ${index + 1})`),
          additionalLoad: parseNum(row.additionalLoad, `Weighing additional load (row ${index + 1})`),
          zeroError: parseNum(row.zeroError, `Weighing zero error (row ${index + 1})`),
          loadingDirection: row.loadingDirection,
        };
        const existingId = nextIds.weighing[row.id];
        const saved = await persistObservation(existingId, existingId
          ? { sequenceIndex: index, observationData }
          : { sessionId, testType: 'WEIGHING_PERFORMANCE', sequenceIndex: index, observationData });
        nextIds.weighing[row.id] = saved.id;
        setObservationIds({
          weighing: { ...nextIds.weighing },
          repeatability: nextIds.repeatability,
          eccentric: { ...nextIds.eccentric },
          discrimination: { ...nextIds.discrimination },
          zeroSetting: nextIds.zeroSetting,
        });
        savedCount += 1;
      }

      const hasRepeatability = repeatability.testLoad.trim() !== '' ||
        repeatability.indications.some((value) => value.trim() !== '') ||
        Boolean(repeatability.series && repeatability.series.length > 0);
      if (hasRepeatability) {
        const observationData = {
          testLoad: parseNum(
            repeatability.testLoad || (repeatability.series?.[0]?.testLoad ?? '0'),
            'Repeatability test load'
          ),
          indications: repeatability.indications.map((val, i) =>
            parseNum(val, `Repeatability indication ${i + 1}`)
          ),
          autoZeroOrTrackingActive: repeatability.autoZeroOrTrackingActive,
          ...(repeatability.series && repeatability.series.length > 0
            ? {
                series: repeatability.series.map((s) => ({
                  seriesNumber: s.seriesNumber,
                  testLoad: parseNum(s.testLoad, `Series ${s.seriesNumber} test load`),
                  indications: s.indications.map((val, i) =>
                    parseNum(val, `Series ${s.seriesNumber} indication ${i + 1}`)
                  ),
                })),
              }
            : {}),
        };
        const existingId = nextIds.repeatability ?? undefined;
        const saved = await persistObservation(existingId, existingId
          ? { observationData }
          : { sessionId, testType: 'REPEATABILITY', sequenceIndex: 0, observationData });
        nextIds.repeatability = saved.id;
        setObservationIds({
          weighing: { ...nextIds.weighing },
          repeatability: nextIds.repeatability,
          eccentric: { ...nextIds.eccentric },
          discrimination: { ...nextIds.discrimination },
          zeroSetting: nextIds.zeroSetting,
        });
        savedCount += 1;
      } else if (nextIds.repeatability) {
        throw new Error('Saved repeatability observations cannot be cleared; restore their values before saving.');
      }

      for (const [index, row] of eccentricRows.entries()) {
        if (row.appliedLoad.trim() === '' && row.indicatedValue.trim() === '') {
          if (nextIds.eccentric[row.id]) throw new Error('A saved eccentric-loading row cannot be cleared; restore its values before saving.');
          continue;
        }
        const observationData = {
          positionId: row.positionId,
          appliedLoad: parseNum(row.appliedLoad, `Eccentric test load (${row.positionId || `row ${index + 1}`})`),
          indicatedValue: parseNum(row.indicatedValue, `Eccentric indicated value (${row.positionId || `row ${index + 1}`})`),
          additionalLoad: parseNum(row.additionalLoad, `Eccentric additional load (${row.positionId || `row ${index + 1}`})`),
          zeroError: parseNum(row.zeroError, `Eccentric zero error (${row.positionId || `row ${index + 1}`})`),
          autoZeroOrTrackingDisabled: row.autoZeroOrTrackingDisabled,
          zeroDeterminedBeforeEachLoading: eccentricZeroDetermined,
        };
        const existingId = nextIds.eccentric[row.id];
        const saved = await persistObservation(existingId, existingId
          ? { sequenceIndex: index, observationData }
          : { sessionId, testType: 'ECCENTRIC_LOADING', sequenceIndex: index, observationData });
        nextIds.eccentric[row.id] = saved.id;
        setObservationIds({
          weighing: { ...nextIds.weighing },
          repeatability: nextIds.repeatability,
          eccentric: { ...nextIds.eccentric },
          discrimination: { ...nextIds.discrimination },
          zeroSetting: nextIds.zeroSetting,
        });
        savedCount += 1;
      }

      for (const [index, row] of discriminationRows.entries()) {
        if (row.testLoad.trim() === '' && row.indicationBefore.trim() === '' && row.indicationAfter.trim() === '') {
          if (nextIds.discrimination[row.id]) throw new Error('A saved discrimination row cannot be cleared; restore its values before saving.');
          continue;
        }
        const observationData = {
          testLoad: parseNum(row.testLoad, `Discrimination test load (row ${index + 1})`),
          indicationBefore: parseNum(row.indicationBefore, `Discrimination indication before (row ${index + 1})`),
          indicationAfter: parseNum(row.indicationAfter, `Discrimination indication after (row ${index + 1})`),
        };
        const existingId = nextIds.discrimination[row.id];
        const saved = await persistObservation(existingId, existingId
          ? { sequenceIndex: index, observationData }
          : { sessionId, testType: 'DISCRIMINATION', sequenceIndex: index, observationData });
        nextIds.discrimination[row.id] = saved.id;
        setObservationIds({
          weighing: { ...nextIds.weighing },
          repeatability: nextIds.repeatability,
          eccentric: { ...nextIds.eccentric },
          discrimination: { ...nextIds.discrimination },
          zeroSetting: nextIds.zeroSetting,
        });
        savedCount += 1;
      }

      const hasZeroSetting = zeroSetting.load.trim() !== '' && zeroSetting.indicatedValue.trim() !== '';
      if (hasZeroSetting) {
        const observationData = {
          load: parseNum(zeroSetting.load, 'Zero-setting test load'),
          indicatedValue: parseNum(zeroSetting.indicatedValue, 'Zero-setting indicated value'),
          additionalLoad: parseNum(zeroSetting.additionalLoad.trim() || '0', 'Zero-setting additional load'),
        };
        const existingId = nextIds.zeroSetting ?? undefined;
        const saved = await persistObservation(existingId, existingId
          ? { observationData }
          : { sessionId, testType: 'ZERO_SETTING_ACCURACY', sequenceIndex: 0, observationData });
        nextIds.zeroSetting = saved.id;
        setObservationIds({
          weighing: { ...nextIds.weighing },
          repeatability: nextIds.repeatability,
          eccentric: { ...nextIds.eccentric },
          discrimination: { ...nextIds.discrimination },
          zeroSetting: nextIds.zeroSetting,
        });
        savedCount += 1;
      } else if (zeroSetting.load.trim() !== '' || zeroSetting.indicatedValue.trim() !== '') {
        throw new Error('Both load and indicated value are required for zero-setting observation.');
      } else if (nextIds.zeroSetting) {
        throw new Error('Saved zero-setting observations cannot be cleared; restore their values before saving.');
      }

      if (session?.status === 'DRAFT') {
        const response = await fetch(`/api/test-sessions/${encodeURIComponent(sessionId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'IN_PROGRESS' }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(observationError(payload, response.status));
        setSession(payload as SavedTestSessionResponse);
      }

      let configSaved = false;
      if (configurationEdited.current) {
        const instResponse = await fetch(`/api/instruments/${encodeURIComponent(instrumentId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: instrument.model.trim(),
            serialNumber: instrument.serialNumber ? instrument.serialNumber.trim() || null : null,
            accuracyClass: instrument.accuracyClass,
            max: instrument.max,
            min: instrument.min,
            e: instrument.e,
            d: instrument.d,
            zeroSettingMechanisms: instrument.zeroSettingMechanisms,
            indicationType: instrument.indicationType || null,
            numberOfSupportPoints: Number(instrument.numberOfSupportPoints),
            additiveTareEffect: instrument.additiveTareEffect,
            hasAutoZeroOrTracking: instrument.hasAutoZeroOrTracking,
            hasInitialZeroSettingDevice: instrument.hasInitialZeroSettingDevice,
            initialZeroSettingRange: instrument.initialZeroSettingRange || '0',
            hasFineDisplayDevice: instrument.hasFineDisplayDevice,
          }),
        });
        const instPayload = await instResponse.json();
        if (!instResponse.ok) {
          throw new Error(observationError(instPayload, instResponse.status));
        }
        configurationEdited.current = false;
        configSaved = true;
      }

      if (savedCount === 0 && !configSaved) {
        throw new Error('Enter at least one complete observation before saving progress.');
      }

      if (savedResults.length > 0) {
        const freshness = await fetchFreshness(sessionId);
        setResultsStale(configurationEdited.current || savedResults.some(record =>
          !freshness.some(item => item.testType === record.testType && item.state === 'CURRENT' &&
            item.evaluatedObservationFingerprint === record.evaluatedObservationFingerprint)
        ));
      }

      setSaveMessage({ tone: 'success', text: 'Observation progress saved.' });
      return { success: true };
    } catch (saveError) {
      const errorText = saveError instanceof Error ? saveError.message : 'Unable to save observation progress.';
      setSaveMessage({
        tone: 'error',
        text: errorText,
      });
      return { success: false, error: errorText };
    } finally {
      setSavingObservations(false);
    }
  }


  async function evaluateCompliance() {
    setLoading(true);
    setError(null);
    setResult(null);
    setResultPersistenceMessage(null);

    try {
      if (resultIntegrityError) throw new Error(resultIntegrityError);
      const saveResult = await saveProgress();
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Evaluation stopped because the current observations could not be saved.');
      }
      if (instrument.instrumentType !== 'SINGLE_RANGE') {
        throw new Error(
          'The current R76 evaluation workflow supports single-range instruments only.'
        );
      }

      const supportPoints = parseNum(
        instrument.numberOfSupportPoints,
        'Number of support points'
      );

      if (
        !Number.isInteger(supportPoints) ||
        supportPoints <= 0
      ) {
        throw new Error(
          'Number of support points must be a positive whole number.'
        );
      }

      if (applicableTestTypes.has(TestType.WeighingPerformance)) {
        if (weighingRows.length === 0) {
          throw new Error('At least one weighing performance observation is required.');
        }
        for (const [index, row] of weighingRows.entries()) {
          if (row.load.trim() === '' && row.indicatedValue.trim() === '') {
            continue;
          }
          const val = validateWeighingLoadInput(row.load, {
            min: Number(instrument.min) || undefined,
            max: Number(instrument.max) || undefined,
          });
          if (!val.isValid) {
            throw new Error(`Weighing performance observation ${index + 1}: ${val.error}`);
          }
        }
      }
      if (applicableTestTypes.has(TestType.EccentricLoading)) {
        if (eccentricRows.length === 0) {
          throw new Error('At least one eccentric loading observation is required.');
        }
        const requiredPositions = supportPoints === 3 ? 3 : 4;
        const testedIds = new Set(eccentricRows.map((r) => r.positionId.trim()).filter(Boolean));
        const expectedPositions = Array.from({ length: requiredPositions }, (_, i) => String(i + 1));
        const missing = expectedPositions.filter(
          (exp) =>
            !Array.from(testedIds).some(
              (id) =>
                id === exp ||
                id.toLowerCase() === `position-${exp}` ||
                id.toLowerCase() === `position ${exp}` ||
                id.toLowerCase() === `pos-${exp}` ||
                id.toLowerCase() === `pos${exp}` ||
                id.toLowerCase() === `quarter-${exp}` ||
                id.toLowerCase() === `quarter ${exp}`
            )
        );
        if (testedIds.size < requiredPositions || missing.length > 0) {
          throw new Error(
            `Incomplete eccentric loading test: Instrument has ${supportPoints} support points requiring ${requiredPositions} loading positions (OIML R 76-1 clause 3.6.2.1 / A.4.7.1). Only ${testedIds.size} distinct position(s) tested. Missing required position(s): ${missing.map((p) => `Position ${p}`).join(', ')}.`
          );
        }
      }
      if (applicableTestTypes.has(TestType.Discrimination) && discriminationRows.length === 0) {
        throw new Error('At least one discrimination observation is required.');
      }
      if (applicableTestTypes.has(TestType.ZeroSettingAccuracy)) {
        if (zeroSetting.load.trim() === '' || zeroSetting.indicatedValue.trim() === '') {
          throw new Error('Zero-setting accuracy observation (load and indicated value) is required.');
        }
      }

      const instrumentPayload: Instrument = {
        id: instrument.id,

        manufacturer:
          instrument.manufacturer.trim(),

        model:
          instrument.model.trim(),

        serialNumber:
          instrument.serialNumber.trim() ||
          undefined,

        accuracyClass:
          instrument.accuracyClass,

        max: parseNum(
          instrument.max,
          'Instrument Max capacity'
        ),

        min: parseNum(
          instrument.min,
          'Instrument Min capacity'
        ),

        e: parseNum(
          instrument.e,
          'Instrument verification scale interval e'
        ),

        d: parseNum(
          instrument.d,
          'Instrument scale interval d'
        ),

        numberOfSupportPoints:
          supportPoints,

        additiveTareEffect:
          instrument.additiveTareEffect,

        hasAutoZeroOrTracking:
          instrument.hasAutoZeroOrTracking,

        hasInitialZeroSettingDevice:
          instrument
            .hasInitialZeroSettingDevice,

        initialZeroSettingRange:
          parseNum(
            instrument
              .initialZeroSettingRange || '0',
            'Initial zero-setting range'
          ),

        hasFineDisplayDevice:
          instrument.hasFineDisplayDevice,

        instrumentType:
          InstrumentType.SingleRange,

        indicationType: instrument.indicationType
          ? (instrument.indicationType.toLowerCase() as IndicationType)
          : undefined,

        zeroSettingMechanisms: Array.isArray(instrument.zeroSettingMechanisms)
          ? (instrument.zeroSettingMechanisms.map(m => m.toLowerCase()) as any[]).sort()
          : undefined,
      };

      const observationsPayload: TestObservations = {
        weighingPerformance: applicableTestTypes.has(TestType.WeighingPerformance)
          ? weighingRows.map(
              (row, index) => ({
                sequenceIndex: index,

                load:
                  parseNum(
                    row.load,
                    `Weighing test load (row ${index + 1})`
                  ),

                indicatedValue:
                  parseNum(
                    row.indicatedValue,
                    `Weighing indicated value (row ${index + 1})`
                  ),

                additionalLoad:
                  parseNum(
                    row.additionalLoad,
                    `Weighing additional load (row ${index + 1})`
                  ),

                zeroError:
                  parseNum(
                    row.zeroError,
                    `Weighing zero error (row ${index + 1})`
                  ),

                loadingDirection:
                  row.loadingDirection,
              })
            )
          : [],

        repeatability: applicableTestTypes.has(TestType.Repeatability)
          ? {
              testLoad:
                parseNum(
                  repeatability.testLoad || (repeatability.series?.[0]?.testLoad ?? '0'),
                  'Repeatability test load'
                ),

              indications:
                repeatability.indications.map(
                  (indication, i) =>
                    parseNum(
                      indication,
                      `Repeatability indication ${i + 1}`
                    )
                ),

              autoZeroOrTrackingActive:
                repeatability
                  .autoZeroOrTrackingActive,

              ...(repeatability.series && repeatability.series.length > 0
                ? {
                    series: repeatability.series.map((s) => ({
                      seriesNumber: s.seriesNumber,
                      testLoad: parseNum(s.testLoad, `Series ${s.seriesNumber} test load`),
                      indications: s.indications.map((val, i) =>
                        parseNum(val, `Series ${s.seriesNumber} indication ${i + 1}`)
                      ),
                    })),
                  }
                : {}),
            }
          : undefined,

        eccentricLoading: applicableTestTypes.has(TestType.EccentricLoading)
          ? eccentricRows.map(
              (row, index) => ({
                positionId:
                  row.positionId.trim(),

                appliedLoad:
                  parseNum(
                    row.appliedLoad,
                    `Eccentric test load (${row.positionId || `row ${index + 1}`})`
                  ),

                indicatedValue:
                  parseNum(
                    row.indicatedValue,
                    `Eccentric indicated value (${row.positionId || `row ${index + 1}`})`
                  ),

                additionalLoad:
                  parseNum(
                    row.additionalLoad,
                    `Eccentric additional load (${row.positionId || `row ${index + 1}`})`
                  ),

                zeroError:
                  parseNum(
                    row.zeroError,
                    `Eccentric zero error (${row.positionId || `row ${index + 1}`})`
                  ),

                autoZeroOrTrackingDisabled:
                  row
                    .autoZeroOrTrackingDisabled,
              })
            )
          : [],

        eccentricZeroDeterminedBeforeEachLoading: applicableTestTypes.has(TestType.EccentricLoading)
          ? eccentricZeroDetermined
          : false,

        discrimination: applicableTestTypes.has(TestType.Discrimination)
          ? discriminationRows.map(
              (row, index) => ({
                testLoad: parseNum(
                  row.testLoad,
                  `Discrimination test load (row ${index + 1})`
                ),
                indicationBefore: parseNum(
                  row.indicationBefore,
                  `Discrimination indication before (row ${index + 1})`
                ),
                indicationAfter: parseNum(
                  row.indicationAfter,
                  `Discrimination indication after (row ${index + 1})`
                ),
              })
            )
          : [],

        zeroSettingAccuracy: applicableTestTypes.has(TestType.ZeroSettingAccuracy)
          ? {
              load: parseNum(zeroSetting.load, 'Zero-setting test load'),
              indicatedValue: parseNum(zeroSetting.indicatedValue, 'Zero-setting indicated value'),
              additionalLoad: parseNum(zeroSetting.additionalLoad.trim() || '0', 'Zero-setting additional load'),
            }
          : undefined,
      };

      const response = await fetch(
        '/api/r76/evaluate',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            sessionId,
            instrument:
              instrumentPayload,

            verificationContext,

            observations:
              observationsPayload,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data?.error === 'string'
            ? data.error
            : `Request failed with status ${response.status}.`
        );

        return;
      }

      const engineResult = data as OrchestrationResult & { savedResults: SavedTestResultResponse[] };
      setResult(engineResult);
      setSavedResults(engineResult.savedResults);
      const freshness = await fetchFreshness(sessionId);
      setResultsStale(engineResult.savedResults.some(record =>
        !freshness.some(item => item.testType === record.testType && item.state === 'CURRENT' &&
          item.evaluatedObservationFingerprint === record.evaluatedObservationFingerprint)
      ));
      setResultPersistenceMessage({ tone: 'success', text: 'Engine evaluation and results saved.' });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to evaluate the supplied data.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitForReview(): Promise<void> {
    if (!session) return;
    setSubmittingReview(true);
    setWorkflowMessage(null);
    try {
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          action: 'SUBMIT_FOR_REVIEW',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(observationError(payload, response.status));
      setSession((current) => current ? { ...current, status: payload.session.status } : current);
      setWorkflowMessage({ tone: 'success', text: 'Session submitted for review. Testing is now read-only.' });
    } catch (submitError) {
      setWorkflowMessage({
        tone: 'error',
        text: submitError instanceof Error ? submitError.message : 'Unable to submit the session for review.',
      });
    } finally {
      setSubmittingReview(false);
    }
  }

  function markDisplayedResultsStale(): void {
    if (result || savedResults.length > 0) {
      setResultsStale(true);
      setResult(null);
      setResultPersistenceMessage(null);
    }
  }

  const testingReadOnly = Boolean(
    session && !['DRAFT', 'IN_PROGRESS', 'RETURNED'].includes(session.status)
  );

  /**
   * Derive test applicability from the currently-loaded instrument.
   * Re-runs whenever the instrument form state changes (e.g. after load).
   * Falls back to showing all three sections when the instrument has not
   * been loaded yet (instrumentLoading) so that the form is never blank.
   */
  const testSelection: TestSelectionResult[] = useMemo(() => {
    if (instrumentLoading || instrumentLoadError) return [];
    // Build a minimal Instrument object from the form state to drive selection.
    // Numeric fields default to 0/false when unparseable so that the engine
    // can still return a definitive selection (it will mark them unsupported).
    const supportPoints = Number(instrument.numberOfSupportPoints);
    const instrumentObj: Instrument = {
      id: instrument.id,
      manufacturer: instrument.manufacturer,
      model: instrument.model,
      serialNumber: instrument.serialNumber || undefined,
      accuracyClass: instrument.accuracyClass,
      max: Number(instrument.max) || 0,
      min: Number(instrument.min) || 0,
      e: Number(instrument.e) || 0,
      d: Number(instrument.d) || 0,
      numberOfSupportPoints: Number.isFinite(supportPoints) && supportPoints > 0 ? supportPoints : 4,
      additiveTareEffect: instrument.additiveTareEffect,
      hasAutoZeroOrTracking: instrument.hasAutoZeroOrTracking,
      hasInitialZeroSettingDevice: instrument.hasInitialZeroSettingDevice,
      initialZeroSettingRange: Number(instrument.initialZeroSettingRange) || 0,
      hasFineDisplayDevice: instrument.hasFineDisplayDevice,
      // The UI form stores 'SINGLE_RANGE'; the engine uses InstrumentType enum.
      // Non-single-range types cause the engine to mark all tests as manual_review.
      instrumentType: instrument.instrumentType === 'SINGLE_RANGE'
        ? InstrumentType.SingleRange
        : (instrument.instrumentType as unknown as InstrumentType),
      indicationType: instrument.indicationType
        ? (instrument.indicationType.toLowerCase() as IndicationType)
        : undefined,
      zeroSettingMechanisms: Array.isArray(instrument.zeroSettingMechanisms)
        ? (instrument.zeroSettingMechanisms.map(m => m.toLowerCase()) as any[]).sort()
        : undefined,
    };
    return selectTests(instrumentObj, verificationContext);
  }, [
    instrumentLoading,
    instrumentLoadError,
    instrument,
    verificationContext,
  ]);

  /** Set of TestType values that the selection engine marked as applicable. */
  const applicableTestTypes = useMemo(
    () => new Set(testSelection.filter(s => s.isApplicable).map(s => s.testType)),
    [testSelection]
  );

  /**
   * The number of applicable (isApplicable === true) tests for this instrument.
   * Used to gate the "Submit for Review" button instead of the hardcoded 3.
   */
  const applicableTestCount = applicableTestTypes.size;

  const canSubmitForReview = Boolean(
    (session?.status === 'IN_PROGRESS' || session?.status === 'RETURNED') &&
    applicableTestCount > 0 &&
    savedResults.length >= applicableTestCount &&
    !resultsStale &&
    !resultIntegrityError
  );

  if (instrumentLoading) {
    return (
      <div role="status" className="rounded-lg border border-[#D9E2EC] bg-white px-5 py-12 text-center text-[0.8rem] text-[#667085] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        Loading registered instrument, observations, and saved results…
      </div>
    );
  }

  if (instrumentLoadError) {
    return (
      <div className="grid justify-items-center gap-3 rounded-lg border border-[#F3C7C7] bg-white px-5 py-10 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <p role="alert" className="m-0 text-[0.8rem] text-[#B42318]">{instrumentLoadError}</p>
        <Link href="/" className="rounded-[5px] border border-[#A9C9E8] bg-[#F6FAFE] px-3 py-2 text-[0.72rem] font-bold text-[#0A66C2] no-underline hover:border-[#0A66C2]">
          Return to Registry
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[5px] border border-[#D9E2EC] bg-white px-3 py-2 text-[0.66rem] text-[#667085] shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <span className="font-bold uppercase tracking-[0.08em] text-[#344054]">Test Session</span>
        <span className="font-mono">{session?.id}</span>
        <span className="h-3 w-px bg-[#D9E2EC]" aria-hidden="true" />
        <span className="font-semibold text-[#0A66C2]">
          {session?.status.replaceAll('_', ' ')}
        </span>
        <span className="h-3 w-px bg-[#D9E2EC]" aria-hidden="true" />
        <span className="font-bold uppercase tracking-[0.08em] text-[#344054]">Active Context</span>
        <span
          data-testid="session-verification-context"
          className="rounded bg-[#EFF8FF] px-2 py-0.5 font-bold uppercase tracking-[0.05em] text-[#175CD3]"
        >
          {getVerificationContextLabel(verificationContext)}
        </span>
      </div>
      {session && <ReportActions sessionId={session.id} status={session.status} />}
      {testingReadOnly && (
        <p role="status" className="m-0 rounded-[5px] border border-[#B9D5EF] bg-[#F6FAFE] px-3 py-2 text-[0.72rem] text-[#004182]">
          This session is {session?.status.replaceAll('_', ' ')}. Observation entry and evaluation are read-only.
        </p>
      )}
      {session?.status === 'RETURNED' && approvals.filter(a => a.action === 'RETURN').length > 0 && (
        <div role="alert" className="rounded-[5px] border border-[#F3C7C7] bg-[#FEF3F2] px-4 py-3 text-[0.76rem]">
          <h3 className="m-0 font-bold text-[#B42318]">Returned for Correction</h3>
          <p className="mt-1 text-[#667085]">
            {approvals.filter(a => a.action === 'RETURN').slice(-1)[0].comments}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(430px,0.82fr)]">
      {/* Input workflow */}
      <div className="flex flex-col gap-4">
        <fieldset disabled={savingObservations || loading || testingReadOnly} className="contents">
        <InstrumentSection
          value={instrument}
          onChange={(value) => {
            setInstrument(value);
            configurationEdited.current = true;
            markDisplayedResultsStale();
          }}
          verificationContext={
            verificationContext
          }
          onVerificationContextChange={
            (value) => {
              setVerificationContext(value);
              configurationEdited.current = true;
              markDisplayedResultsStale();
            }
          }
        />

        {/* Weighing Performance — shown only when selection engine marks it applicable */}
        {testSelection.length === 0 || applicableTestTypes.has(TestType.WeighingPerformance) ? (
          <WeighingPerformanceSection
            rows={weighingRows}
            onChange={(rows) => {
              setWeighingRows(rows);
              markDisplayedResultsStale();
            }}
            nextId={() => generateRowId('w')}
            verificationContext={verificationContext}
            instrumentMin={Number(instrument.min) || undefined}
            instrumentMax={Number(instrument.max) || undefined}
            instrumentE={Number(instrument.e) || undefined}
          />
        ) : (
          <NotApplicableBanner
            testName="Weighing Performance"
            reason={testSelection.find(s => s.testType === TestType.WeighingPerformance)?.reason ?? 'Not applicable for this instrument configuration.'}
            r76Reference={testSelection.find(s => s.testType === TestType.WeighingPerformance)?.r76Reference}
          />
        )}

        {/* Repeatability — shown only when selection engine marks it applicable */}
        {testSelection.length === 0 || applicableTestTypes.has(TestType.Repeatability) ? (
          <RepeatabilitySection
            value={repeatability}
            onChange={(value) => {
              setRepeatability(value);
              markDisplayedResultsStale();
            }}
            accuracyClass={
              instrument.accuracyClass
            }
            instrumentHasAutoZero={
              instrument
                .hasAutoZeroOrTracking
            }
            verificationContext={verificationContext}
            instrumentMax={Number(instrument.max) || undefined}
          />
        ) : (
          <NotApplicableBanner
            testName="Repeatability"
            reason={testSelection.find(s => s.testType === TestType.Repeatability)?.reason ?? 'Not applicable for this instrument configuration.'}
            r76Reference={testSelection.find(s => s.testType === TestType.Repeatability)?.r76Reference}
          />
        )}

        {/* Eccentric Loading — shown only when selection engine marks it applicable */}
        {testSelection.length === 0 || applicableTestTypes.has(TestType.EccentricLoading) ? (
          <EccentricLoadingSection
            rows={eccentricRows}
            onChange={(rows) => {
              setEccentricRows(rows);
              markDisplayedResultsStale();
            }}
            zeroDeterminedBeforeEachLoading={
              eccentricZeroDetermined
            }
            onZeroDeterminedChange={
              (value) => {
                setEccentricZeroDetermined(value);
                markDisplayedResultsStale();
              }
            }
            instrumentHasAutoZero={
              instrument
                .hasAutoZeroOrTracking
            }
            numberOfSupportPoints={
              Number(instrument.numberOfSupportPoints) || 4
            }
            instrumentMax={Number(instrument.max) || undefined}
            instrumentE={Number(instrument.e) || undefined}
            nextId={() => generateRowId('e')}
          />
        ) : (
          <NotApplicableBanner
            testName="Eccentric Loading"
            reason={testSelection.find(s => s.testType === TestType.EccentricLoading)?.reason ?? 'Not applicable for this instrument configuration.'}
            r76Reference={testSelection.find(s => s.testType === TestType.EccentricLoading)?.r76Reference}
          />
        )}

        {/* Discrimination — shown only when selection engine marks it applicable */}
        {testSelection.length === 0 || applicableTestTypes.has(TestType.Discrimination) ? (
          <DiscriminationSection
            rows={discriminationRows}
            onChange={(rows) => {
              setDiscriminationRows(rows);
              markDisplayedResultsStale();
            }}
            nextId={() => generateRowId('d')}
          />
        ) : (
          <NotApplicableBanner
            testName="Discrimination"
            reason={testSelection.find(s => s.testType === TestType.Discrimination)?.reason ?? 'Not applicable for this instrument configuration.'}
            r76Reference={testSelection.find(s => s.testType === TestType.Discrimination)?.r76Reference}
          />
        )}

        {/* Zero-Setting Accuracy */}
        {testSelection.length === 0 || applicableTestTypes.has(TestType.ZeroSettingAccuracy) ? (
          <ZeroSettingSection
            value={zeroSetting}
            onChange={(val) => {
              setZeroSetting(val);
              markDisplayedResultsStale();
            }}
          />
        ) : (
          <NotApplicableBanner
            testName="Zero-Setting Accuracy"
            reason={testSelection.find(s => s.testType === TestType.ZeroSettingAccuracy)?.reason ?? 'Not applicable for this instrument configuration.'}
            r76Reference={testSelection.find(s => s.testType === TestType.ZeroSettingAccuracy)?.r76Reference}
          />
        )}

        </fieldset>
        {saveMessage && (
          <p
            role={saveMessage.tone === 'error' ? 'alert' : 'status'}
            className={`m-0 rounded-[5px] border px-3 py-2 text-[0.72rem] ${
              saveMessage.tone === 'error'
                ? 'border-[#F3C7C7] bg-[#FEF3F2] text-[#B42318]'
                : 'border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]'
            }`}
          >
            {saveMessage.text}
          </p>
        )}
        {(resultIntegrityError || resultPersistenceMessage) && (
          <p
            role={resultIntegrityError || resultPersistenceMessage?.tone === 'error' ? 'alert' : 'status'}
            className={`m-0 rounded-[5px] border px-3 py-2 text-[0.72rem] ${
              resultIntegrityError || resultPersistenceMessage?.tone === 'error'
                ? 'border-[#F3C7C7] bg-[#FEF3F2] text-[#B42318]'
                : 'border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]'
            }`}
          >
            {resultIntegrityError ?? resultPersistenceMessage?.text}
          </p>
        )}
        {workflowMessage && (
          <p role={workflowMessage.tone === 'error' ? 'alert' : 'status'} className={`m-0 rounded-[5px] border px-3 py-2 text-[0.72rem] ${workflowMessage.tone === 'error' ? 'border-[#F3C7C7] bg-[#FEF3F2] text-[#B42318]' : 'border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]'}`}>
            {workflowMessage.text}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#D9E2EC] pt-1 sm:border-0 sm:pt-0">
          {testingReadOnly ? null : (
            <>
          <button
            type="button"
            onClick={() => void saveProgress()}
            disabled={savingObservations || loading || persistingResults}
            className="min-w-[170px] rounded-[5px] border border-[#A9C9E8] bg-[#F6FAFE] px-5 py-3 text-[0.8rem] font-bold text-[#0A66C2] transition-colors hover:border-[#0A66C2] hover:bg-[#EAF3FC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingObservations ? 'Saving…' : 'Save Progress'}
          </button>
          <button
            type="button"
            onClick={
              evaluateCompliance
            }
            disabled={loading || savingObservations || persistingResults || Boolean(resultIntegrityError)}
            className="min-w-[230px] rounded-[5px] bg-[#0A66C2] px-6 py-3 text-[0.82rem] font-bold text-white shadow-[0_1px_2px_rgba(16,24,40,0.12)] transition-colors hover:bg-[#004182] disabled:cursor-not-allowed disabled:bg-[#98A2B3]"
          >
            {persistingResults
              ? 'Persisting results…'
              : loading
              ? 'Evaluating…'
              : 'Evaluate Compliance'}
          </button>
            </>
          )}
          {canSubmitForReview && (
            <button
              type="button"
              onClick={() => void submitForReview()}
              disabled={submittingReview}
              className="min-w-[190px] rounded-[5px] bg-[#067647] px-5 py-3 text-[0.8rem] font-bold text-white disabled:bg-[#98A2B3]"
            >
              {submittingReview
                ? 'Submitting…'
                : session?.status === 'RETURNED'
                ? 'Resubmit for Review'
                : 'Submit for Review'}
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="xl:sticky xl:top-5">
        <ResultsSection
          result={result}
          savedResults={savedResults}
          savedResultsStale={resultsStale}
          error={error}
          loading={loading}
        />
      </div>
      </div>
    </div>
  );
}
