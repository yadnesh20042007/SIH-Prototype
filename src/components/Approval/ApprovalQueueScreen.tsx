'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { ComplianceTracePanel } from '@/components/Evaluation/ComplianceTracePanel';
import type { SavedTestResultResponse } from '@/components/Evaluation/result-persistence';

type QueueMode = 'review' | 'approval';
type QueueStatus = 'PENDING_REVIEW' | 'PENDING_APPROVAL';

interface SessionRecord {
  id: string;
  instrumentId: string;
  status: QueueStatus;
  verificationContext: string;
  createdAt: string;
}

interface InstrumentRecord {
  id: string;
  manufacturer: { name: string };
  model: string;
  serialNumber: string | null;
  accuracyClass: string;
  instrumentType: string;
  max: string;
  min: string;
  e: string;
  d: string;
}

interface ApprovalRecord {
  id: string;
  action: string;
  comments: string | null;
  createdAt: string;
  user?: { name: string; role: string };
}

interface DevelopmentContext {
  reviewer: { id: string; name: string };
  approver: { id: string; name: string };
}

interface QueueItem {
  session: SessionRecord;
  instrument: InstrumentRecord;
  results: SavedTestResultResponse[];
  approvals: ApprovalRecord[];
  ready: boolean;
  readinessMessage: string | null;
}

function apiError(payload: unknown, fallback: string): string {
  return typeof payload === 'object' && payload !== null && 'error' in payload &&
    typeof payload.error === 'string' ? payload.error : fallback;
}

async function jsonRequest(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const payload = await response.json();
  if (!response.ok) throw new Error(apiError(payload, `Request failed with status ${response.status}.`));
  return payload;
}

async function loadQueueItem(session: SessionRecord): Promise<QueueItem> {
  const [instrument, results, approvals, freshness] = await Promise.all([
    jsonRequest(`/api/instruments/${encodeURIComponent(session.instrumentId)}`),
    jsonRequest(`/api/test-results?testSessionId=${encodeURIComponent(session.id)}`),
    jsonRequest(`/api/approvals?testSessionId=${encodeURIComponent(session.id)}`),
    jsonRequest(`/api/test-results/freshness?testSessionId=${encodeURIComponent(session.id)}`),
  ]);
  const freshnessItems = freshness as Array<{ testType: string; state: string }>;
  const notCurrent = freshnessItems.filter(({ state }) => state !== 'CURRENT');
  return {
    session,
    instrument: instrument as InstrumentRecord,
    results: results as SavedTestResultResponse[],
    approvals: approvals as ApprovalRecord[],
    ready: freshnessItems.length === 3 && notCurrent.length === 0,
    readinessMessage: notCurrent.length
      ? `${notCurrent.map(({ testType, state }) => `${testType.replaceAll('_', ' ')}: ${state}`).join('; ')}`
      : freshnessItems.length === 3 ? null : 'The complete server readiness state is unavailable.',
  };
}

function label(value: string): string {
  return value.replaceAll('_', ' ');
}

export function ApprovalQueueScreen({ mode }: { mode: QueueMode }) {
  const status: QueueStatus = mode === 'review' ? 'PENDING_REVIEW' : 'PENDING_APPROVAL';
  const [items, setItems] = useState<QueueItem[]>([]);
  const [context, setContext] = useState<DevelopmentContext | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionsPayload, contextPayload] = await Promise.all([
        jsonRequest(`/api/test-sessions?status=${status}`),
        jsonRequest('/api/test-sessions/development-context'),
      ]);
      const sessions = sessionsPayload as SessionRecord[];
      setContext(contextPayload as DevelopmentContext);
      setItems(await Promise.all(sessions.map(loadQueueItem)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the approval queue.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function decide(sessionId: string, approved: boolean): Promise<void> {
    if (!context) return;
    setActingId(sessionId);
    setError(null);
    setMessage(null);
    const reviewer = mode === 'review';
    try {
      await jsonRequest('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userId: reviewer ? context.reviewer.id : context.approver.id,
          action: reviewer
            ? approved ? 'REVIEW_APPROVE' : 'REVIEW_REJECT'
            : approved ? 'FINAL_APPROVE' : 'FINAL_REJECT',
          ...(comments[sessionId]?.trim() ? { comments: comments[sessionId].trim() } : {}),
        }),
      });
      setMessage(approved
        ? reviewer ? 'Session approved for final approval.' : 'Session received final approval.'
        : 'Session rejected.');
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to record the decision.');
    } finally {
      setActingId(null);
    }
  }

  if (loading) return <p role="status" className="rounded-lg border border-[#D9E2EC] bg-white p-8 text-center text-[0.78rem] text-[#667085]">Loading {mode === 'review' ? 'review' : 'final approval'} queue…</p>;

  return (
    <div className="grid gap-4">
      {error && <p role="alert" className="m-0 rounded-md border border-[#F3C7C7] bg-[#FEF3F2] px-4 py-3 text-[0.75rem] text-[#B42318]">{error}</p>}
      {message && <p role="status" className="m-0 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] px-4 py-3 text-[0.75rem] text-[#067647]">{message}</p>}
      {items.length === 0 && !error && <div className="rounded-lg border border-dashed border-[#BFCEDC] bg-white px-6 py-10 text-center text-[0.78rem] text-[#667085]">No sessions are waiting for {mode === 'review' ? 'review' : 'final approval'}.</div>}
      {items.map(({ session, instrument, results, approvals, ready, readinessMessage }) => (
        <article key={session.id} className="overflow-hidden rounded-lg border border-[#D9E2EC] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#D9E2EC] bg-[#FBFCFD] px-5 py-4">
            <div>
              <p className="m-0 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[#0A66C2]">{label(session.status)}</p>
              <h2 className="m-0 mt-1 text-[1rem] font-bold text-[#1D2226]">{instrument.manufacturer.name} {instrument.model}</h2>
              <p className="m-0 mt-1 font-mono text-[0.62rem] text-[#667085]">Session {session.id}</p>
            </div>
            <Link href={`/evaluate/${encodeURIComponent(instrument.id)}?sessionId=${encodeURIComponent(session.id)}`} className="rounded border border-[#A9C9E8] bg-[#F6FAFE] px-3 py-2 text-[0.68rem] font-bold text-[#0A66C2] no-underline">Open read-only evaluation</Link>
          </header>
          <div className="grid gap-5 p-5 lg:grid-cols-[0.78fr_1.22fr]">
            <div className="grid content-start gap-4">
              <section>
                <h3 className="m-0 text-[0.68rem] font-bold uppercase tracking-[0.09em] text-[#344054]">Instrument</h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.7rem]">
                  <div><dt className="text-[#667085]">Class</dt><dd className="m-0 font-semibold">{instrument.accuracyClass}</dd></div>
                  <div><dt className="text-[#667085]">Type</dt><dd className="m-0 font-semibold">{label(instrument.instrumentType)}</dd></div>
                  <div><dt className="text-[#667085]">Max / Min</dt><dd className="m-0 font-semibold">{instrument.max} / {instrument.min}</dd></div>
                  <div><dt className="text-[#667085]">e / d</dt><dd className="m-0 font-semibold">{instrument.e} / {instrument.d}</dd></div>
                </dl>
              </section>
              <section>
                <h3 className="m-0 text-[0.68rem] font-bold uppercase tracking-[0.09em] text-[#344054]">Approval history</h3>
                <ol className="mt-2 grid gap-2 pl-0 text-[0.68rem]">
                  {approvals.map((approval) => <li key={approval.id} className="list-none border-l-2 border-[#A9C9E8] pl-2"><span className="font-semibold">{label(approval.action)}</span> · {approval.user?.name ?? 'Development user'}{approval.comments && <span className="block text-[#667085]">{approval.comments}</span>}</li>)}
                </ol>
              </section>
              {!ready && <p role="alert" className="m-0 rounded border border-[#FEDF89] bg-[#FFFAEB] p-3 text-[0.68rem] text-[#B54708]">Server readiness check: {readinessMessage ?? 'not current'}</p>}
              <label className="grid gap-1 text-[0.68rem] font-semibold text-[#344054]">Optional comment<textarea value={comments[session.id] ?? ''} onChange={(event) => setComments((current) => ({ ...current, [session.id]: event.target.value }))} rows={3} className="rounded border border-[#BFCEDC] px-3 py-2 font-normal outline-none focus:border-[#0A66C2]" /></label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!ready || actingId === session.id} onClick={() => void decide(session.id, true)} className="rounded bg-[#0A66C2] px-4 py-2 text-[0.72rem] font-bold text-white disabled:bg-[#98A2B3]">{mode === 'review' ? 'Approve for Final Approval' : 'Final Approve'}</button>
                <button type="button" disabled={actingId === session.id} onClick={() => void decide(session.id, false)} className="rounded border border-[#FDA29B] bg-white px-4 py-2 text-[0.72rem] font-bold text-[#B42318] disabled:opacity-50">{mode === 'review' ? 'Reject' : 'Final Reject'}</button>
              </div>
            </div>
            <section className="grid content-start gap-3">
              <h3 className="m-0 text-[0.68rem] font-bold uppercase tracking-[0.09em] text-[#344054]">Persisted engine results</h3>
              {results.map((result) => (
                <div key={result.id} className="rounded-md border border-[#D9E2EC] p-3">
                  <div className="flex justify-between gap-3"><strong className="text-[0.72rem]">{label(result.testType)}</strong><span className="text-[0.65rem] font-bold text-[#004182]">{label(result.outcome)}</span></div>
                  <p className="m-0 mt-2 text-[0.68rem] text-[#475467]">Maximum absolute error {result.maxAbsoluteError} kg · MPE ±{result.mpe} kg</p>
                  <p className="m-0 mt-1 text-[0.63rem] font-semibold text-[#004182]">{result.r76Reference}</p>
                  <ComplianceTracePanel traces={result.complianceTrace} label="View Compliance Trace" />
                </div>
              ))}
            </section>
          </div>
        </article>
      ))}
    </div>
  );
}
