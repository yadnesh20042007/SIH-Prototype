'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Select } from '@/components/ui/FormField';

type SessionStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'PENDING_REVIEW'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

interface TestSessionRecord {
  id: string;
  instrumentId: string;
  verificationContext:
    | 'INITIAL_VERIFICATION'
    | 'SUBSEQUENT_VERIFICATION'
    | 'SERVICE_INSPECTION';
  status: SessionStatus;
  createdAt: string;
}

interface DevelopmentTestSessionContext {
  rulesetVersion: {
    id: string;
    standard: string;
    version: string;
  };
  technician: {
    id: string;
    name: string;
    role: 'LAB_TECHNICIAN';
  };
}

interface ApiErrorPayload {
  error?: unknown;
  errors?: Array<{ field?: unknown; message?: unknown }>;
}

const RESUMABLE_STATUSES = new Set<SessionStatus>(['DRAFT', 'IN_PROGRESS']);
const PENDING_STATUSES = new Set<SessionStatus>(['PENDING_REVIEW', 'PENDING_APPROVAL']);

function sessionUrl(instrumentId: string, sessionId: string): string {
  return `/evaluate/${encodeURIComponent(instrumentId)}?sessionId=${encodeURIComponent(sessionId)}`;
}

function displayStatus(status: SessionStatus): string {
  return status.replaceAll('_', ' ');
}

function errorMessage(payload: ApiErrorPayload, status: number): string {
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors
      .map(({ field, message }) =>
        typeof field === 'string' && typeof message === 'string'
          ? `${field}: ${message}`
          : null
      )
      .filter(Boolean)
      .join('; ');
  }
  return typeof payload.error === 'string'
    ? payload.error
    : `Request failed with status ${status}.`;
}

async function readPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return {};
  }
}

async function fetchSessionStartData(
  instrumentId: string,
  signal?: AbortSignal
): Promise<{
  sessions: TestSessionRecord[];
  developmentContext: DevelopmentTestSessionContext;
}> {
  const [sessionsResponse, contextResponse] = await Promise.all([
    fetch(`/api/test-sessions?instrumentId=${encodeURIComponent(instrumentId)}`, { signal }),
    fetch('/api/test-sessions/development-context', { signal }),
  ]);
  const [sessionsPayload, contextPayload] = await Promise.all([
    readPayload(sessionsResponse),
    readPayload(contextResponse),
  ]);

  if (!sessionsResponse.ok) {
    throw new Error(errorMessage(sessionsPayload, sessionsResponse.status));
  }
  if (!contextResponse.ok) {
    throw new Error(errorMessage(contextPayload, contextResponse.status));
  }

  return {
    sessions: sessionsPayload as unknown as TestSessionRecord[],
    developmentContext: contextPayload as unknown as DevelopmentTestSessionContext,
  };
}

export function InstrumentSessionActions({ instrumentId }: { instrumentId: string }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<TestSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [developmentContext, setDevelopmentContext] =
    useState<DevelopmentTestSessionContext | null>(null);
  const [form, setForm] = useState({
    verificationContext: 'INITIAL_VERIFICATION',
  });

  const loadSessionStartData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSessionStartData(instrumentId, signal);
      setSessions(data.sessions);
      setDevelopmentContext(data.developmentContext);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setError(
        loadError instanceof Error ? loadError.message : 'Unable to load test sessions.'
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [instrumentId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchSessionStartData(instrumentId, controller.signal)
      .then((data) => {
        setSessions(data.sessions);
        setDevelopmentContext(data.developmentContext);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(
          loadError instanceof Error ? loadError.message : 'Unable to load test sessions.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [instrumentId]);

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!developmentContext) {
      setError('Development session context is unavailable.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/test-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrumentId,
          verificationContext: form.verificationContext,
          rulesetVersionId: developmentContext.rulesetVersion.id,
          technicianId: developmentContext.technician.id,
        }),
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(errorMessage(payload, response.status));

      const created = payload as unknown as TestSessionRecord;
      router.push(sessionUrl(instrumentId, created.id));
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Unable to start the test session.'
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <span role="status" className="text-[0.68rem] text-[#667085]">Loading sessions…</span>;
  }

  const resumable = sessions.filter(({ status }) => RESUMABLE_STATUSES.has(status));
  const pending = sessions.filter(({ status }) => PENDING_STATUSES.has(status));
  const approved = sessions.filter(({ status }) => status === 'APPROVED');
  const closedCount = sessions.length - resumable.length - pending.length - approved.length;

  return (
    <div className="ml-auto flex min-w-[210px] max-w-[280px] flex-col items-end gap-2">
      {error && (
        <div className="flex flex-col items-end gap-1">
          <span role="alert" className="text-right text-[0.66rem] leading-snug text-[#B42318]">
            {error}
          </span>
          <button
            type="button"
            onClick={() => void loadSessionStartData()}
            className="text-[0.65rem] font-semibold text-[#0A66C2]"
          >
            Retry
          </button>
        </div>
      )}

      {resumable.map((session) => (
        <Link
          key={session.id}
          href={sessionUrl(instrumentId, session.id)}
          className="inline-flex items-center gap-2 rounded-[5px] border border-[#A9C9E8] bg-[#F6FAFE] px-3 py-1.5 text-[0.68rem] font-bold text-[#0A66C2] no-underline hover:border-[#0A66C2] hover:bg-[#EAF3FC]"
        >
          Resume Test Session
          <span className="font-medium text-[#667085]">{displayStatus(session.status)}</span>
        </Link>
      ))}

      {pending.map((session) => (
        <span
          key={session.id}
          className="rounded-[5px] border border-[#D9E2EC] bg-[#F8FAFC] px-2.5 py-1.5 text-[0.65rem] font-semibold text-[#667085]"
        >
          Session {displayStatus(session.status)}
        </span>
      ))}

      {approved.map((session) => (
        <Link
          key={session.id}
          href={sessionUrl(instrumentId, session.id)}
          className="inline-flex items-center gap-2 rounded-[5px] border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-1.5 text-[0.68rem] font-bold text-[#067647] no-underline"
        >
          Open Approved Session
        </Link>
      ))}

      {closedCount > 0 && (
        <span className="text-[0.63rem] text-[#7B8794]">
          {closedCount} closed session{closedCount === 1 ? '' : 's'}
        </span>
      )}

      {!error && resumable.length === 0 && pending.length === 0 && !setupOpen && (
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="rounded-[5px] bg-[#0A66C2] px-3 py-2 text-[0.7rem] font-bold text-white hover:bg-[#004182]"
        >
          Start Test Session
        </button>
      )}

      {resumable.length === 0 && pending.length === 0 && setupOpen && (
        <form
          onSubmit={startSession}
          className="grid w-full gap-2 rounded-md border border-[#D9E2EC] bg-[#FBFCFD] p-2.5 text-left"
        >
          <Select
            value={form.verificationContext}
            onChange={(verificationContext) =>
              setForm((current) => ({ ...current, verificationContext }))
            }
            disabled={creating}
            options={[
              { value: 'INITIAL_VERIFICATION', label: 'Initial verification' },
              { value: 'SUBSEQUENT_VERIFICATION', label: 'Subsequent verification' },
              { value: 'SERVICE_INSPECTION', label: 'Service inspection' },
            ]}
          />
          <div className="rounded-[5px] border border-[#E4EAF0] bg-white px-2.5 py-2 text-[0.64rem] leading-relaxed text-[#667085]">
            <div>
              Ruleset: <span className="font-semibold text-[#344054]">
                {developmentContext?.rulesetVersion.standard}:{developmentContext?.rulesetVersion.version}
              </span>
            </div>
            <div>
              Technician: <span className="font-semibold text-[#344054]">
                {developmentContext?.technician.name}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSetupOpen(false)}
              disabled={creating}
              className="rounded-[5px] border border-[#BFCEDC] bg-white px-2.5 py-1.5 text-[0.66rem] font-semibold text-[#344054] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-[5px] bg-[#0A66C2] px-2.5 py-1.5 text-[0.66rem] font-bold text-white hover:bg-[#004182] disabled:bg-[#98A2B3]"
            >
              {creating ? 'Starting…' : 'Start Test Session'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
