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
import { ConfirmDemoModal } from './ConfirmDemoModal';
import {
  generateWeighingPerformanceDemo,
  generateRepeatabilityDemo,
  generateEccentricLoadingDemo,
  generateDiscriminationDemo,
  generateZeroSettingDemo,
  hasWeighingReadings,
  hasRepeatabilityReadings,
  hasEccentricReadings,
  hasDiscriminationReadings,
  hasZeroSettingReadings,
} from '@/lib/r76/demo-data';
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
  const [demoStatus, setDemoStatus] = useState<{
    weighing: boolean;
    repeatability: boolean;
    eccentric: boolean;
    discrimination: boolean;
    zeroSetting: boolean;
  }>({
    weighing: false,
    repeatability: false,
    eccentric: false,
    discrimination: false,
    zeroSetting: false,
  });
  const [modifiedDemo, setModifiedDemo] = useState<{
    weighing: boolean;
    repeatability: boolean;
    eccentric: boolean;
    discrimination: boolean;
    zeroSetting: boolean;
  }>({
    weighing: false,
    repeatability: false,
    eccentric: false,
    discrimination: false,
    zeroSetting: false,
  });
  const originalDemoSnapshot = useRef<{
    weighing?: string;
    repeatability?: string;
    eccentric?: string;
    discrimination?: string;
    zeroSetting?: string;
  }>({});
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);
  const [demoMessage, setDemoMessage] = useState<{
    tone: 'error' | 'success' | 'info';
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
        const checkRecordsDemo = (records: SavedTestObservationResponse[]): { isDemo: boolean; isModified: boolean } => {
          let isDemo = false;
          let isModified = false;
          for (const record of records) {
            const d = record.observationData as Record<string, unknown> | undefined;
            if (d && (d.isDemo === true || d.dataSource === 'DEMO_DATA')) {
              isDemo = true;
            }
            if (d && d.isModified === true) {
              isModified = true;
            }
          }
          return { isDemo, isModified };
        };

        const weighingDemoInfo = checkRecordsDemo(weighing);
        const repeatabilityDemoInfo = checkRecordsDemo(repeatabilityRecords);
        const eccentricDemoInfo = checkRecordsDemo(eccentric);
        const discriminationDemoInfo = checkRecordsDemo(discrimination);
        const zeroSettingDemoInfo = checkRecordsDemo(zeroSettingRecords);

        setDemoStatus({
          weighing: weighingDemoInfo.isDemo,
          repeatability: repeatabilityDemoInfo.isDemo,
          eccentric: eccentricDemoInfo.isDemo,
          discrimination: discriminationDemoInfo.isDemo,
          zeroSetting: zeroSettingDemoInfo.isDemo,
        });

        setModifiedDemo({
          weighing: weighingDemoInfo.isModified,
          repeatability: repeatabilityDemoInfo.isModified,
          eccentric: eccentricDemoInfo.isModified,
          discrimination: discriminationDemoInfo.isModified,
          zeroSetting: zeroSettingDemoInfo.isModified,
        });

        if (weighingDemoInfo.isDemo) originalDemoSnapshot.current.weighing = JSON.stringify(loadedWeighing);
        if (repeatabilityDemoInfo.isDemo) originalDemoSnapshot.current.repeatability = JSON.stringify(loadedRepeatability);
        if (eccentricDemoInfo.isDemo) originalDemoSnapshot.current.eccentric = JSON.stringify(loadedEccentric);
        if (discriminationDemoInfo.isDemo) originalDemoSnapshot.current.discrimination = JSON.stringify(loadedDiscrimination);
        if (zeroSettingDemoInfo.isDemo) originalDemoSnapshot.current.zeroSetting = JSON.stringify(loadedZeroSetting);
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
          ...(demoStatus.weighing ? { isDemo: true, dataSource: 'DEMO_DATA', ...(modifiedDemo.weighing ? { isModified: true } : {}) } : {}),
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
          ...(demoStatus.repeatability ? { isDemo: true, dataSource: 'DEMO_DATA', ...(modifiedDemo.repeatability ? { isModified: true } : {}) } : {}),
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
          ...(demoStatus.eccentric ? { isDemo: true, dataSource: 'DEMO_DATA', ...(modifiedDemo.eccentric ? { isModified: true } : {}) } : {}),
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
          ...(demoStatus.discrimination ? { isDemo: true, dataSource: 'DEMO_DATA', ...(modifiedDemo.discrimination ? { isModified: true } : {}) } : {}),
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
          ...(demoStatus.zeroSetting ? { isDemo: true, dataSource: 'DEMO_DATA', ...(modifiedDemo.zeroSetting ? { isModified: true } : {}) } : {}),
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

  function applyInstrumentConfigChange(
    newInstrument: InstrumentFormState,
    newContext: VerificationContext,
    regenerateDemo: boolean
  ) {
    setInstrument(newInstrument);
    setVerificationContext(newContext);
    configurationEdited.current = true;
    markDisplayedResultsStale();

    if (!regenerateDemo) {
      setDemoMessage({
        tone: 'info',
        text: 'Instrument configuration updated. Kept your existing measurement readings.',
      });
      return;
    }

    // If demo data was active, update it to maintain compatibility with new instrument parameters
    const nextStatus = { ...demoStatus };
    const nextModified = { ...modifiedDemo };
    let updatedAny = false;

    if (demoStatus.weighing) {
      const res = generateWeighingPerformanceDemo(newInstrument, newContext);
      if (res.success && res.data) {
        setWeighingRows(res.data);
        originalDemoSnapshot.current.weighing = JSON.stringify(res.data);
        nextModified.weighing = false;
        updatedAny = true;
      } else {
        nextStatus.weighing = false;
        nextModified.weighing = false;
        setWeighingRows([createWeighingRow()]);
      }
    }

    if (demoStatus.repeatability) {
      const res = generateRepeatabilityDemo(newInstrument, newContext);
      if (res.success && res.data) {
        setRepeatability(res.data);
        originalDemoSnapshot.current.repeatability = JSON.stringify(res.data);
        nextModified.repeatability = false;
        updatedAny = true;
      } else {
        nextStatus.repeatability = false;
        nextModified.repeatability = false;
        setRepeatability(createDefaultRepeatability());
      }
    }

    if (demoStatus.eccentric) {
      const res = generateEccentricLoadingDemo(newInstrument);
      if (res.success && res.data) {
        setEccentricRows(res.data);
        originalDemoSnapshot.current.eccentric = JSON.stringify(res.data);
        nextModified.eccentric = false;
        updatedAny = true;
      } else {
        nextStatus.eccentric = false;
        nextModified.eccentric = false;
        setEccentricRows([createEccentricRow(undefined, 'position-1')]);
      }
    }

    if (demoStatus.discrimination) {
      const res = generateDiscriminationDemo(newInstrument, newContext);
      if (res.success && res.data) {
        setDiscriminationRows(res.data);
        originalDemoSnapshot.current.discrimination = JSON.stringify(res.data);
        nextModified.discrimination = false;
        updatedAny = true;
      } else {
        nextStatus.discrimination = false;
        nextModified.discrimination = false;
        setDiscriminationRows([createDiscriminationRow(undefined, '')]);
      }
    }

    if (demoStatus.zeroSetting) {
      const res = generateZeroSettingDemo(newInstrument);
      if (res.success && res.data) {
        setZeroSetting(res.data);
        originalDemoSnapshot.current.zeroSetting = JSON.stringify(res.data);
        nextModified.zeroSetting = false;
        updatedAny = true;
      } else {
        nextStatus.zeroSetting = false;
        nextModified.zeroSetting = false;
        setZeroSetting(createDefaultZeroSetting());
      }
    }

    setDemoStatus(nextStatus);
    setModifiedDemo(nextModified);
    if (updatedAny) {
      setDemoMessage({
        tone: 'info',
        text: 'Demo data updated to match the new instrument configuration.',
      });
    }
  }

  function handleInstrumentConfigChange(
    newInstrument: InstrumentFormState,
    newContext: VerificationContext
  ) {
    const hasAnyActiveDemo = Object.values(demoStatus).some(Boolean);
    const hasAnyModifiedDemo = Object.values(modifiedDemo).some(Boolean);

    // If active demo data has manual modifications, ask for confirmation before overwriting
    if (hasAnyActiveDemo && hasAnyModifiedDemo) {
      setConfirmModal({
        isOpen: true,
        title: 'Update demo data for new configuration?',
        message:
          'You have manually modified demo measurement readings. Updating demo data to match the new instrument configuration will replace your manual edits with freshly generated values. Do you want to regenerate demo data or keep your current readings?',
        confirmLabel: 'Regenerate Demo Data',
        cancelLabel: 'Keep Current Readings',
        onConfirm: () => {
          setConfirmModal(null);
          applyInstrumentConfigChange(newInstrument, newContext, true);
        },
        onCancel: () => {
          setConfirmModal(null);
          applyInstrumentConfigChange(newInstrument, newContext, false);
        },
      });
      return;
    }

    applyInstrumentConfigChange(newInstrument, newContext, true);
  }

  function executeLoadWeighingDemo() {
    const res = generateWeighingPerformanceDemo(instrument, verificationContext);
    if (!res.success || !res.data) {
      setDemoMessage({ tone: 'error', text: res.reason || 'Cannot generate weighing performance demo data.' });
      return;
    }
    setWeighingRows(res.data);
    originalDemoSnapshot.current.weighing = JSON.stringify(res.data);
    setDemoStatus((prev) => ({ ...prev, weighing: true }));
    setModifiedDemo((prev) => ({ ...prev, weighing: false }));
    markDisplayedResultsStale();
    setDemoMessage({ tone: 'success', text: `Loaded demo data for Weighing Performance (${res.data.length} observations).` });
  }

  function requestLoadWeighingDemo() {
    if (hasWeighingReadings(weighingRows)) {
      setConfirmModal({
        isOpen: true,
        title: 'Replace Weighing Performance readings?',
        message: 'This module already contains entered measurement readings. Loading demo data will replace your current entries with sample demonstration readings. You will be able to inspect and edit all values before saving or evaluating.',
        onConfirm: () => {
          setConfirmModal(null);
          executeLoadWeighingDemo();
        },
      });
    } else {
      executeLoadWeighingDemo();
    }
  }

  function handleClearWeighingDemo() {
    setWeighingRows([createWeighingRow()]);
    setDemoStatus((prev) => ({ ...prev, weighing: false }));
    setModifiedDemo((prev) => ({ ...prev, weighing: false }));
    markDisplayedResultsStale();
  }

  function executeLoadRepeatabilityDemo() {
    const res = generateRepeatabilityDemo(instrument, verificationContext);
    if (!res.success || !res.data) {
      setDemoMessage({ tone: 'error', text: res.reason || 'Cannot generate repeatability demo data.' });
      return;
    }
    setRepeatability(res.data);
    originalDemoSnapshot.current.repeatability = JSON.stringify(res.data);
    setDemoStatus((prev) => ({ ...prev, repeatability: true }));
    setModifiedDemo((prev) => ({ ...prev, repeatability: false }));
    markDisplayedResultsStale();
    setDemoMessage({ tone: 'success', text: 'Loaded demo data for Repeatability.' });
  }

  function requestLoadRepeatabilityDemo() {
    if (hasRepeatabilityReadings(repeatability)) {
      setConfirmModal({
        isOpen: true,
        title: 'Replace Repeatability readings?',
        message: 'This module already contains entered measurement readings. Loading demo data will replace your current entries with sample demonstration readings. You will be able to inspect and edit all values before saving or evaluating.',
        onConfirm: () => {
          setConfirmModal(null);
          executeLoadRepeatabilityDemo();
        },
      });
    } else {
      executeLoadRepeatabilityDemo();
    }
  }

  function handleClearRepeatabilityDemo() {
    setRepeatability(createDefaultRepeatability());
    setDemoStatus((prev) => ({ ...prev, repeatability: false }));
    setModifiedDemo((prev) => ({ ...prev, repeatability: false }));
    markDisplayedResultsStale();
  }

  function executeLoadEccentricDemo() {
    const res = generateEccentricLoadingDemo(instrument);
    if (!res.success || !res.data) {
      setDemoMessage({ tone: 'error', text: res.reason || 'Cannot generate eccentric loading demo data.' });
      return;
    }
    setEccentricRows(res.data);
    originalDemoSnapshot.current.eccentric = JSON.stringify(res.data);
    setDemoStatus((prev) => ({ ...prev, eccentric: true }));
    setModifiedDemo((prev) => ({ ...prev, eccentric: false }));
    markDisplayedResultsStale();
    setDemoMessage({ tone: 'success', text: `Loaded demo data for Eccentric Loading (${res.data.length} positions).` });
  }

  function requestLoadEccentricDemo() {
    if (hasEccentricReadings(eccentricRows)) {
      setConfirmModal({
        isOpen: true,
        title: 'Replace Eccentric Loading readings?',
        message: 'This module already contains entered measurement readings. Loading demo data will replace your current entries with sample demonstration readings. You will be able to inspect and edit all values before saving or evaluating.',
        onConfirm: () => {
          setConfirmModal(null);
          executeLoadEccentricDemo();
        },
      });
    } else {
      executeLoadEccentricDemo();
    }
  }

  function handleClearEccentricDemo() {
    setEccentricRows([createEccentricRow(undefined, 'position-1')]);
    setDemoStatus((prev) => ({ ...prev, eccentric: false }));
    setModifiedDemo((prev) => ({ ...prev, eccentric: false }));
    markDisplayedResultsStale();
  }

  function executeLoadDiscriminationDemo() {
    const res = generateDiscriminationDemo(instrument, verificationContext);
    if (!res.success || !res.data) {
      setDemoMessage({ tone: 'error', text: res.reason || 'Cannot generate discrimination demo data.' });
      return;
    }
    setDiscriminationRows(res.data);
    originalDemoSnapshot.current.discrimination = JSON.stringify(res.data);
    setDemoStatus((prev) => ({ ...prev, discrimination: true }));
    setModifiedDemo((prev) => ({ ...prev, discrimination: false }));
    markDisplayedResultsStale();
    setDemoMessage({ tone: 'success', text: `Loaded demo data for Digital Discrimination (${res.data.length} points).` });
  }

  function requestLoadDiscriminationDemo() {
    if (hasDiscriminationReadings(discriminationRows)) {
      setConfirmModal({
        isOpen: true,
        title: 'Replace Discrimination readings?',
        message: 'This module already contains entered measurement readings. Loading demo data will replace your current entries with sample demonstration readings. You will be able to inspect and edit all values before saving or evaluating.',
        onConfirm: () => {
          setConfirmModal(null);
          executeLoadDiscriminationDemo();
        },
      });
    } else {
      executeLoadDiscriminationDemo();
    }
  }

  function handleClearDiscriminationDemo() {
    setDiscriminationRows([createDiscriminationRow(undefined, '')]);
    setDemoStatus((prev) => ({ ...prev, discrimination: false }));
    setModifiedDemo((prev) => ({ ...prev, discrimination: false }));
    markDisplayedResultsStale();
  }

  function executeLoadZeroSettingDemo() {
    const res = generateZeroSettingDemo(instrument);
    if (!res.success || !res.data) {
      setDemoMessage({ tone: 'error', text: res.reason || 'Cannot generate zero-setting demo data.' });
      return;
    }
    setZeroSetting(res.data);
    originalDemoSnapshot.current.zeroSetting = JSON.stringify(res.data);
    setDemoStatus((prev) => ({ ...prev, zeroSetting: true }));
    setModifiedDemo((prev) => ({ ...prev, zeroSetting: false }));
    markDisplayedResultsStale();
    setDemoMessage({ tone: 'success', text: 'Loaded demo data for Zero-Setting Accuracy.' });
  }

  function requestLoadZeroSettingDemo() {
    if (hasZeroSettingReadings(zeroSetting)) {
      setConfirmModal({
        isOpen: true,
        title: 'Replace Zero-Setting Accuracy readings?',
        message: 'This module already contains entered measurement readings. Loading demo data will replace your current entries with sample demonstration readings. You will be able to inspect and edit all values before saving or evaluating.',
        onConfirm: () => {
          setConfirmModal(null);
          executeLoadZeroSettingDemo();
        },
      });
    } else {
      executeLoadZeroSettingDemo();
    }
  }

  function handleClearZeroSettingDemo() {
    setZeroSetting(createDefaultZeroSetting());
    setDemoStatus((prev) => ({ ...prev, zeroSetting: false }));
    setModifiedDemo((prev) => ({ ...prev, zeroSetting: false }));
    markDisplayedResultsStale();
  }

  function executeLoadAllDemo() {
    let loadedCount = 0;
    const nextStatus = { ...demoStatus };
    const nextModified = { ...modifiedDemo };
    const msgs: string[] = [];

    if (applicableTestTypes.has(TestType.WeighingPerformance)) {
      const res = generateWeighingPerformanceDemo(instrument, verificationContext);
      if (res.success && res.data) {
        setWeighingRows(res.data);
        originalDemoSnapshot.current.weighing = JSON.stringify(res.data);
        nextStatus.weighing = true;
        nextModified.weighing = false;
        loadedCount++;
      } else if (res.reason) {
        msgs.push(`Weighing: ${res.reason}`);
      }
    }

    if (applicableTestTypes.has(TestType.Repeatability)) {
      const res = generateRepeatabilityDemo(instrument, verificationContext);
      if (res.success && res.data) {
        setRepeatability(res.data);
        originalDemoSnapshot.current.repeatability = JSON.stringify(res.data);
        nextStatus.repeatability = true;
        nextModified.repeatability = false;
        loadedCount++;
      } else if (res.reason) {
        msgs.push(`Repeatability: ${res.reason}`);
      }
    }

    if (applicableTestTypes.has(TestType.EccentricLoading)) {
      const res = generateEccentricLoadingDemo(instrument);
      if (res.success && res.data) {
        setEccentricRows(res.data);
        originalDemoSnapshot.current.eccentric = JSON.stringify(res.data);
        nextStatus.eccentric = true;
        nextModified.eccentric = false;
        loadedCount++;
      } else if (res.reason) {
        msgs.push(`Eccentric: ${res.reason}`);
      }
    }

    if (applicableTestTypes.has(TestType.Discrimination)) {
      const res = generateDiscriminationDemo(instrument, verificationContext);
      if (res.success && res.data) {
        setDiscriminationRows(res.data);
        originalDemoSnapshot.current.discrimination = JSON.stringify(res.data);
        nextStatus.discrimination = true;
        nextModified.discrimination = false;
        loadedCount++;
      } else if (res.reason) {
        msgs.push(`Discrimination: ${res.reason}`);
      }
    }

    if (applicableTestTypes.has(TestType.ZeroSettingAccuracy)) {
      const res = generateZeroSettingDemo(instrument);
      if (res.success && res.data) {
        setZeroSetting(res.data);
        originalDemoSnapshot.current.zeroSetting = JSON.stringify(res.data);
        nextStatus.zeroSetting = true;
        nextModified.zeroSetting = false;
        loadedCount++;
      } else if (res.reason) {
        msgs.push(`Zero-Setting: ${res.reason}`);
      }
    }

    setDemoStatus(nextStatus);
    setModifiedDemo(nextModified);
    markDisplayedResultsStale();

    if (loadedCount > 0) {
      const warning = msgs.length > 0 ? ` (${msgs.join('; ')})` : '';
      setDemoMessage({
        tone: 'success',
        text: `Loaded demo data for ${loadedCount} applicable test module(s).${warning}`,
      });
    } else {
      setDemoMessage({
        tone: 'error',
        text: msgs.length > 0 ? msgs.join('; ') : 'No applicable tests available for demo data.',
      });
    }
  }

  function requestLoadAllDemo() {
    const hasAnyData =
      (applicableTestTypes.has(TestType.WeighingPerformance) && hasWeighingReadings(weighingRows)) ||
      (applicableTestTypes.has(TestType.Repeatability) && hasRepeatabilityReadings(repeatability)) ||
      (applicableTestTypes.has(TestType.EccentricLoading) && hasEccentricReadings(eccentricRows)) ||
      (applicableTestTypes.has(TestType.Discrimination) && hasDiscriminationReadings(discriminationRows)) ||
      (applicableTestTypes.has(TestType.ZeroSettingAccuracy) && hasZeroSettingReadings(zeroSetting));

    if (hasAnyData) {
      setConfirmModal({
        isOpen: true,
        title: 'Replace existing test readings with demo data?',
        message: 'One or more test modules already contain entered measurement readings. Loading demo data will replace them with sample demonstration readings for all applicable tests. You can inspect and edit all values before saving or evaluating.',
        onConfirm: () => {
          setConfirmModal(null);
          executeLoadAllDemo();
        },
      });
    } else {
      executeLoadAllDemo();
    }
  }

  function handleClearAllDemo() {
    setWeighingRows([createWeighingRow()]);
    setRepeatability(createDefaultRepeatability());
    setEccentricRows([createEccentricRow(undefined, 'position-1')]);
    setDiscriminationRows([createDiscriminationRow(undefined, '')]);
    setZeroSetting(createDefaultZeroSetting());
    setDemoStatus({
      weighing: false,
      repeatability: false,
      eccentric: false,
      discrimination: false,
      zeroSetting: false,
    });
    setModifiedDemo({
      weighing: false,
      repeatability: false,
      eccentric: false,
      discrimination: false,
      zeroSetting: false,
    });
    markDisplayedResultsStale();
    setDemoMessage({ tone: 'info', text: 'All demo sample readings cleared.' });
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[5px] border border-[#D9E2EC] bg-white px-3 py-2 text-[0.66rem] text-[#667085] shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
          {Object.values(demoStatus).some(Boolean) && (
            <>
              <span className="h-3 w-px bg-[#D9E2EC]" aria-hidden="true" />
              <span className="rounded bg-[#FEF3C7] px-2 py-0.5 font-bold uppercase tracking-[0.05em] text-[#92400E]">
                DEMO DATA ACTIVE
              </span>
            </>
          )}
        </div>
        {!testingReadOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestLoadAllDemo}
              disabled={savingObservations || loading}
              className="rounded-[5px] border border-[#F59E0B] bg-[#FFFBEB] px-3 py-1 text-[0.7rem] font-bold text-[#92400E] shadow-2xs transition-colors hover:bg-[#FEF3C7] disabled:opacity-50"
            >
              Load Demo Data (All Tests)
            </button>
            {Object.values(demoStatus).some(Boolean) && (
              <button
                type="button"
                onClick={handleClearAllDemo}
                className="text-[0.68rem] font-semibold text-[#667085] hover:text-[#B42318]"
              >
                Clear Demo Data
              </button>
            )}
          </div>
        )}
      </div>
      {demoMessage && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-[5px] border px-3 py-2 text-[0.72rem] ${demoMessage.tone === 'error'
            ? 'border-[#F3C7C7] bg-[#FEF3F2] text-[#B42318]'
            : demoMessage.tone === 'info'
              ? 'border-[#B9D5EF] bg-[#F6FAFE] text-[#004182]'
              : 'border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]'
            }`}
        >
          <span>{demoMessage.text}</span>
          <button
            type="button"
            onClick={() => setDemoMessage(null)}
            className="ml-2 text-[0.68rem] font-bold opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}
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
              onChange={(value) => handleInstrumentConfigChange(value, verificationContext)}
              verificationContext={verificationContext}
              onVerificationContextChange={(value) => handleInstrumentConfigChange(instrument, value)}
            />

        {/* Weighing Performance — shown only when selection engine marks it applicable */}
        {testSelection.length === 0 || applicableTestTypes.has(TestType.WeighingPerformance) ? (
          <WeighingPerformanceSection
            rows={weighingRows}
            onChange={(rows) => {
              setWeighingRows(rows);
              markDisplayedResultsStale();
              if (!hasWeighingReadings(rows)) {
                setDemoStatus((prev) => ({ ...prev, weighing: false }));
                setModifiedDemo((prev) => ({ ...prev, weighing: false }));
              } else if (demoStatus.weighing && originalDemoSnapshot.current.weighing) {
                const isDiff = JSON.stringify(rows) !== originalDemoSnapshot.current.weighing;
                setModifiedDemo((prev) => ({ ...prev, weighing: isDiff }));
              }
            }}
            nextId={() => generateRowId('w')}
            verificationContext={verificationContext}
            instrumentMin={Number(instrument.min) || undefined}
            instrumentMax={Number(instrument.max) || undefined}
            instrumentE={Number(instrument.e) || undefined}
            onLoadDemoData={testingReadOnly ? undefined : requestLoadWeighingDemo}
            isDemoData={demoStatus.weighing}
            isDemoModified={modifiedDemo.weighing}
            onClearDemoData={testingReadOnly ? undefined : handleClearWeighingDemo}
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
              if (!hasRepeatabilityReadings(value)) {
                setDemoStatus((prev) => ({ ...prev, repeatability: false }));
                setModifiedDemo((prev) => ({ ...prev, repeatability: false }));
              } else if (demoStatus.repeatability && originalDemoSnapshot.current.repeatability) {
                const isDiff = JSON.stringify(value) !== originalDemoSnapshot.current.repeatability;
                setModifiedDemo((prev) => ({ ...prev, repeatability: isDiff }));
              }
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
            onLoadDemoData={testingReadOnly ? undefined : requestLoadRepeatabilityDemo}
            isDemoData={demoStatus.repeatability}
            isDemoModified={modifiedDemo.repeatability}
            onClearDemoData={testingReadOnly ? undefined : handleClearRepeatabilityDemo}
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
              if (!hasEccentricReadings(rows)) {
                setDemoStatus((prev) => ({ ...prev, eccentric: false }));
                setModifiedDemo((prev) => ({ ...prev, eccentric: false }));
              } else if (demoStatus.eccentric && originalDemoSnapshot.current.eccentric) {
                const isDiff = JSON.stringify(rows) !== originalDemoSnapshot.current.eccentric;
                setModifiedDemo((prev) => ({ ...prev, eccentric: isDiff }));
              }
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
            onLoadDemoData={testingReadOnly ? undefined : requestLoadEccentricDemo}
            isDemoData={demoStatus.eccentric}
            isDemoModified={modifiedDemo.eccentric}
            onClearDemoData={testingReadOnly ? undefined : handleClearEccentricDemo}
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
              if (!hasDiscriminationReadings(rows)) {
                setDemoStatus((prev) => ({ ...prev, discrimination: false }));
                setModifiedDemo((prev) => ({ ...prev, discrimination: false }));
              } else if (demoStatus.discrimination && originalDemoSnapshot.current.discrimination) {
                const isDiff = JSON.stringify(rows) !== originalDemoSnapshot.current.discrimination;
                setModifiedDemo((prev) => ({ ...prev, discrimination: isDiff }));
              }
            }}
            nextId={() => generateRowId('d')}
            onLoadDemoData={testingReadOnly ? undefined : requestLoadDiscriminationDemo}
            isDemoData={demoStatus.discrimination}
            isDemoModified={modifiedDemo.discrimination}
            onClearDemoData={testingReadOnly ? undefined : handleClearDiscriminationDemo}
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
              if (!hasZeroSettingReadings(val)) {
                setDemoStatus((prev) => ({ ...prev, zeroSetting: false }));
                setModifiedDemo((prev) => ({ ...prev, zeroSetting: false }));
              } else if (demoStatus.zeroSetting && originalDemoSnapshot.current.zeroSetting) {
                const isDiff = JSON.stringify(val) !== originalDemoSnapshot.current.zeroSetting;
                setModifiedDemo((prev) => ({ ...prev, zeroSetting: isDiff }));
              }
            }}
            onLoadDemoData={testingReadOnly ? undefined : requestLoadZeroSettingDemo}
            isDemoData={demoStatus.zeroSetting}
            isDemoModified={modifiedDemo.zeroSetting}
            onClearDemoData={testingReadOnly ? undefined : handleClearZeroSettingDemo}
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
              className={`m-0 rounded-[5px] border px-3 py-2 text-[0.72rem] ${saveMessage.tone === 'error'
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
              className={`m-0 rounded-[5px] border px-3 py-2 text-[0.72rem] ${resultIntegrityError || resultPersistenceMessage?.tone === 'error'
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
      {confirmModal && (
        <ConfirmDemoModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          cancelLabel={confirmModal.cancelLabel}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => {
            if (confirmModal.onCancel) confirmModal.onCancel();
            setConfirmModal(null);
          }}
        />
      )}
    </div>
  );
}
