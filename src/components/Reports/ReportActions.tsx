'use client';

import { useEffect, useState } from 'react';

interface ReportRecord {
  id: string;
  referenceNumber: string;
  pdfUrl: string | null;
  verificationUrl: string;
}

function message(payload: unknown, fallback: string): string {
  return typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
    ? payload.error : fallback;
}

export function ReportActions({ sessionId, status }: { sessionId: string; status: string }) {
  const [report, setReport] = useState<ReportRecord | null>(null);
  const [loading, setLoading] = useState(status === 'APPROVED');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'APPROVED') return;
    const controller = new AbortController();
    fetch(`/api/reports?testSessionId=${encodeURIComponent(sessionId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(message(payload, 'Unable to load reports.'));
        setReport((payload as ReportRecord[])[0] ?? null);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load reports.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sessionId, status]);

  if (status !== 'APPROVED') return null;

  async function generate(): Promise<void> {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testSessionId: sessionId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(message(payload, 'Unable to generate the report.'));
      setReport(payload as ReportRecord);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate the report.');
    } finally { setGenerating(false); }
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#B9D5EF] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div>
        <p className="m-0 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[#0A66C2]">Approved report</p>
        <p className="m-0 mt-1 text-[0.72rem] text-[#667085]">{loading ? 'Checking generated reports…' : report ? report.referenceNumber : 'Generate the persisted R76-2-aligned report.'}</p>
        {error && <p role="alert" className="m-0 mt-1 text-[0.68rem] text-[#B42318]">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {!report && !loading && <button type="button" onClick={() => void generate()} disabled={generating} className="rounded bg-[#0A66C2] px-4 py-2 text-[0.72rem] font-bold text-white disabled:bg-[#98A2B3]">{generating ? 'Generating…' : 'Generate Test Report'}</button>}
        {report?.pdfUrl && <><a href={report.pdfUrl} target="_blank" rel="noreferrer" className="rounded border border-[#A9C9E8] bg-[#F6FAFE] px-4 py-2 text-[0.72rem] font-bold text-[#0A66C2] no-underline">View PDF</a><a href={`${report.pdfUrl}?download=1`} className="rounded bg-[#0A66C2] px-4 py-2 text-[0.72rem] font-bold text-white no-underline">Download PDF</a><a href={report.verificationUrl} target="_blank" rel="noreferrer" className="rounded border border-[#ABEFC6] bg-[#ECFDF3] px-4 py-2 text-[0.72rem] font-bold text-[#067647] no-underline">Verify Report</a></>}
      </div>
    </section>
  );
}
