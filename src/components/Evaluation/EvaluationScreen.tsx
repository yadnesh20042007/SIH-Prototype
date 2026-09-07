'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  InstrumentType,
  VerificationContext,
  type Instrument,
} from '@/lib/r76/types';

import type {
  TestObservations,
  OrchestrationResult,
} from '@/lib/r76/engine';

import { InstrumentSection } from './InstrumentSection';
import { WeighingPerformanceSection } from './WeighingPerformanceSection';
import { RepeatabilitySection } from './RepeatabilitySection';
import { EccentricLoadingSection } from './EccentricLoadingSection';
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
  parseNum,
  type InstrumentFormState,
  type WeighingRowState,
  type RepeatabilityFormState,
  type EccentricRowState,
} from './types';

interface SavedInstrumentResponse {
  id: string;
  manufacturer: { name: string };
  model: string;
  serialNumber: string | null;
  accuracyClass: InstrumentFormState['accuracyClass'];
  instrumentType: InstrumentFormState['instrumentType'];
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
}

interface SavedTestSessionResponse {
  id: string;
  instrumentId: string;
  verificationContext:
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
    | 'CANCELLED';
  rulesetVersionId: string;
}

interface SavedTestObservationResponse {
  id: string;
  sessionId: string;
  testType: 'WEIGHING_PERFORMANCE' | 'REPEATABILITY' | 'ECCENTRIC_LOADING';
  sequenceIndex: number;
  observationData: Record<string, unknown>;
  createdAt: string;
}

interface ObservationIds {
  weighing: Record<string, string>;
  repeatability: string | null;
  eccentric: Record<string, string>;
}

const EMPTY_OBSERVATION_IDS: ObservationIds = {
  weighing: {},
  repeatability: null,
  eccentric: {},
};

interface EvaluationScreenProps {
  instrumentId: string;
  sessionId: string;
}

const VERIFICATION_CONTEXT_BY_SESSION = {
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

async function fetchFreshness(sessionId: string): Promise<{
  testType: StoredTestType; state: string; evaluatedObservationFingerprint: string | null;
}[]> {
    const response = await fetch(`/api/test-results/freshness?testSessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(observationError(payload, response.status));
    return payload;
  }


export function EvaluationScreen({ instrumentId, sessionId }: EvaluationScreenProps) {
  const idCounter = useRef(0);
  const configurationEdited = useRef(false);

  const nextId = () => String(idCounter.current++);

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
    useState<WeighingRowState[]>([
      createWeighingRow('w-0'),
    ]);

  const [repeatability, setRepeatability] =
    useState<RepeatabilityFormState>(
      createDefaultRepeatability()
    );

  const [eccentricRows, setEccentricRows] =
    useState<EccentricRowState[]>([
      createEccentricRow(
        'e-0',
        'position-1'
      ),
    ]);

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

        const [instrumentResponse, sessionResponse, observationsResponse, resultsResponse] = await Promise.all([
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
        ]);
        const data = (await instrumentResponse.json()) as SavedInstrumentResponse & {
          error?: string;
        };
        const sessionData = (await sessionResponse.json()) as SavedTestSessionResponse & {
          error?: string;
        };
        const observationsData = await observationsResponse.json();
        const resultsData = await resultsResponse.json();
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
        });
        setSession(sessionData);
        setVerificationContext(
          VERIFICATION_CONTEXT_BY_SESSION[sessionData.verificationContext]
        );
        const observations = observationsData as SavedTestObservationResponse[];
        const weighing = observations.filter(({ testType }) => testType === 'WEIGHING_PERFORMANCE');
        const repeatabilityRecords = observations.filter(({ testType }) => testType === 'REPEATABILITY');
        const eccentric = observations.filter(({ testType }) => testType === 'ECCENTRIC_LOADING');
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

        const loadedIds: ObservationIds = { weighing: {}, repeatability: null, eccentric: {} };
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
              testLoad: String(repeatabilityRecord.observationData.testLoad),
              indications: (repeatabilityRecord.observationData.indications as number[]).map(String),
              autoZeroOrTrackingActive: Boolean(
                repeatabilityRecord.observationData.autoZeroOrTrackingActive
              ),
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
        setWeighingRows(loadedWeighing.length ? loadedWeighing : [createWeighingRow('w-0')]);
        setRepeatability(loadedRepeatability);
        setEccentricRows(loadedEccentric.length ? loadedEccentric : [createEccentricRow('e-0', 'position-1')]);
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

  async function saveProgress(): Promise<boolean> {
    setSavingObservations(true);
    setSaveMessage(null);
    const nextIds: ObservationIds = {
      weighing: { ...observationIds.weighing },
      repeatability: observationIds.repeatability,
      eccentric: { ...observationIds.eccentric },
    };
    let savedCount = 0;

    try {
      if (Object.keys(nextIds.weighing).some(id => !weighingRows.some(row => row.id === id)) ||
        Object.keys(nextIds.eccentric).some(id => !eccentricRows.some(row => row.id === id))) {
        throw new Error('Saved observation rows cannot be removed here. Reload to restore them before saving.');
      }
      for (const [index, row] of weighingRows.entries()) {
        if (row.load.trim() === '' && row.indicatedValue.trim() === '') {
          if (nextIds.weighing[row.id]) throw new Error('A saved weighing row cannot be cleared; restore its values before saving.');
          continue;
        }
        const observationData = {
          sequenceIndex: index,
          load: parseNum(row.load),
          indicatedValue: parseNum(row.indicatedValue),
          additionalLoad: parseNum(row.additionalLoad),
          zeroError: parseNum(row.zeroError),
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
        });
        savedCount += 1;
      }

      const hasRepeatability = repeatability.testLoad.trim() !== '' ||
        repeatability.indications.some((value) => value.trim() !== '');
      if (hasRepeatability) {
        const observationData = {
          testLoad: parseNum(repeatability.testLoad),
          indications: repeatability.indications.map(parseNum),
          autoZeroOrTrackingActive: repeatability.autoZeroOrTrackingActive,
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
          appliedLoad: parseNum(row.appliedLoad),
          indicatedValue: parseNum(row.indicatedValue),
          additionalLoad: parseNum(row.additionalLoad),
          zeroError: parseNum(row.zeroError),
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
        });
        savedCount += 1;
      }

      if (savedCount === 0) {
        throw new Error('Enter at least one complete observation before saving progress.');
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

      if (savedResults.length > 0) {
        const freshness = await fetchFreshness(sessionId);
        setResultsStale(configurationEdited.current || savedResults.some(record =>
          !freshness.some(item => item.testType === record.testType && item.state === 'CURRENT' &&
            item.evaluatedObservationFingerprint === record.evaluatedObservationFingerprint)
        ));
      }

      setSaveMessage({ tone: 'success', text: 'Observation progress saved.' });
      return true;
    } catch (saveError) {
      setSaveMessage({
        tone: 'error',
        text: saveError instanceof Error ? saveError.message : 'Unable to save observation progress.',
      });
      return false;
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
      const observationsSaved = await saveProgress();
      if (!observationsSaved) {
        throw new Error('Evaluation stopped because the current observations could not be saved.');
      }
      if (instrument.instrumentType !== 'SINGLE_RANGE') {
        throw new Error(
          'The current R76 evaluation workflow supports single-range instruments only.'
        );
      }

      const supportPoints = parseNum(
        instrument.numberOfSupportPoints
      );

      if (
        !Number.isInteger(supportPoints) ||
        supportPoints <= 0
      ) {
        throw new Error(
          'Number of support points must be a positive whole number.'
        );
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
          instrument.max
        ),

        min: parseNum(
          instrument.min
        ),

        e: parseNum(
          instrument.e
        ),

        d: parseNum(
          instrument.d
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
              .initialZeroSettingRange
          ),

        hasFineDisplayDevice:
          instrument.hasFineDisplayDevice,

        instrumentType:
          InstrumentType.SingleRange,
      };

      const observationsPayload: TestObservations =
        {
          weighingPerformance:
            weighingRows.map(
              (row, index) => ({
                sequenceIndex: index,

                load:
                  parseNum(
                    row.load
                  ),

                indicatedValue:
                  parseNum(
                    row.indicatedValue
                  ),

                additionalLoad:
                  parseNum(
                    row.additionalLoad
                  ),

                zeroError:
                  parseNum(
                    row.zeroError
                  ),

                loadingDirection:
                  row.loadingDirection,
              })
            ),

          repeatability: {
            testLoad:
              parseNum(
                repeatability.testLoad
              ),

            indications:
              repeatability.indications.map(
                (indication) =>
                  parseNum(indication)
              ),

            autoZeroOrTrackingActive:
              repeatability
                .autoZeroOrTrackingActive,
          },

          eccentricLoading:
            eccentricRows.map(
              (row) => ({
                positionId:
                  row.positionId.trim(),

                appliedLoad:
                  parseNum(
                    row.appliedLoad
                  ),

                indicatedValue:
                  parseNum(
                    row.indicatedValue
                  ),

                additionalLoad:
                  parseNum(
                    row.additionalLoad
                  ),

                zeroError:
                  parseNum(
                    row.zeroError
                  ),

                autoZeroOrTrackingDisabled:
                  row
                    .autoZeroOrTrackingDisabled,
              })
            ),

          eccentricZeroDeterminedBeforeEachLoading:
            eccentricZeroDetermined,
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
    session && !['DRAFT', 'IN_PROGRESS'].includes(session.status)
  );
  const canSubmitForReview = Boolean(
    session?.status === 'IN_PROGRESS' &&
    savedResults.length === 3 &&
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
      </div>
      {session && <ReportActions sessionId={session.id} status={session.status} />}
      {testingReadOnly && (
        <p role="status" className="m-0 rounded-[5px] border border-[#B9D5EF] bg-[#F6FAFE] px-3 py-2 text-[0.72rem] text-[#004182]">
          This session is {session?.status.replaceAll('_', ' ')}. Observation entry and evaluation are read-only.
        </p>
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

        <WeighingPerformanceSection
          rows={weighingRows}
          onChange={(rows) => {
            setWeighingRows(rows);
            markDisplayedResultsStale();
          }}
          nextId={() =>
            `w-${nextId()}`
          }
        />

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
        />

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
          nextId={() =>
            `e-${nextId()}`
          }
        />

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
            <button type="button" onClick={() => void submitForReview()} disabled={submittingReview} className="min-w-[190px] rounded-[5px] bg-[#067647] px-5 py-3 text-[0.8rem] font-bold text-white disabled:bg-[#98A2B3]">
              {submittingReview ? 'Submitting…' : 'Submit for Review'}
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
