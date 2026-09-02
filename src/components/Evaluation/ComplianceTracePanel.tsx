'use client';

/**
 * @file ComplianceTracePanel.tsx
 * @description Expandable panel that renders a structured Compliance Trace
 * produced by the backend R76 engine. This component performs NO compliance
 * calculations — it only presents data received from the server.
 */

import { useState } from 'react';
import type { ComplianceTrace, R76DocumentReference } from '@/lib/r76/types';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface ComplianceTracePanelProps {
  /** A single trace (Repeatability) or array of traces (Weighing, Eccentric). */
  traces: ComplianceTrace | ComplianceTrace[];
  /** Optional label shown on the toggle button. Defaults to "View Compliance Trace". */
  label?: string;
}

export function ComplianceTracePanel({ traces, label = 'View Compliance Trace' }: ComplianceTracePanelProps) {
  const [open, setOpen] = useState(false);
  const traceArray = Array.isArray(traces) ? traces : [traces];

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-[5px] border border-[#B9D5EF] bg-[#F6FAFE] px-3 py-2 text-left text-[0.72rem] font-semibold text-[#004182] hover:bg-[#EAF3FC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A66C2]"
      >
        <span className="flex items-center gap-2">
          {/* Magnifier icon */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="#0A66C2" strokeWidth="1.5" />
            <path d="M10 10l3.5 3.5" stroke="#0A66C2" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {label}
        </span>
        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        >
          <path d="M2 4l4 4 4-4" stroke="#0A66C2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-1 space-y-3 rounded-[5px] border border-[#D9E2EC] bg-white p-3">
          {traceArray.map((trace, idx) => (
            <SingleTraceView
              key={idx}
              trace={trace}
              index={traceArray.length > 1 ? idx + 1 : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single observation trace ────────────────────────────────────────────────

function SingleTraceView({ trace, index }: { trace: ComplianceTrace; index?: number }) {
  return (
    <div className="space-y-2.5">
      {index !== undefined && (
        <p className="m-0 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[#667085]">
          Observation {index}
        </p>
      )}

      {/* A. Instrument / Evaluation Context */}
      <TraceSection eyebrow="A" title="Instrument & Evaluation Context">
        <ContextGrid entries={trace.instrumentContext} />
      </TraceSection>

      {/* B. Applicable R76 References */}
      <TraceSection eyebrow="B" title="Applicable OIML R 76-1:2006 (E) References">
        <div className="space-y-1.5">
          {trace.references.map((ref, i) => (
            <ReferenceRow key={i} ref_={ref} />
          ))}
        </div>
      </TraceSection>

      {/* C. Observed Inputs */}
      <TraceSection eyebrow="C" title="Observed Values">
        <ContextGrid entries={trace.inputs} />
      </TraceSection>

      {/* D + E + F. Formula steps */}
      <TraceSection eyebrow="D – F" title="Formula → Substitution → Result">
        <div className="space-y-2">
          {trace.calculationSteps.map((step, i) => (
            <FormulaStep key={i} step={step} />
          ))}
        </div>
      </TraceSection>

      {/* G. MPE Determination */}
      <TraceSection eyebrow="G" title="MPE Determination (Table 6)">
        <MPETraceView mpe={trace.mpeTrace} />
      </TraceSection>

      {/* H. Final Comparison */}
      <TraceSection eyebrow="H" title="Final Compliance Comparison">
        <ComparisonView comparison={trace.comparison} />
      </TraceSection>

      {/* I. Outcome */}
      <div className="flex items-center gap-2 pt-0.5">
        <span className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[#667085]">I — Outcome</span>
        <StatusBadge status={trace.outcome} size="sm" />
      </div>

      {/* Divider between multiple observations */}
      {index !== undefined && <hr className="border-[#E4EAF0]" />}
    </div>
  );
}

// ─── Section wrapper ────────────────────────────────────────────────────────

function TraceSection({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-[#E4EAF0] bg-[#FBFCFD]">
      <div className="border-b border-[#E4EAF0] px-3 py-1.5">
        <span className="mr-1.5 text-[0.55rem] font-bold uppercase tracking-[0.12em] text-[#0A66C2]">{eyebrow}</span>
        <span className="text-[0.68rem] font-semibold text-[#344054]">{title}</span>
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

// ─── Context / Input grid ────────────────────────────────────────────────────

function ContextGrid({ entries }: { entries: Record<string, string | number | boolean> }) {
  const pairs = Object.entries(entries);
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
      {pairs.map(([k, v]) => (
        <div key={k}>
          <p className="m-0 text-[0.57rem] font-bold uppercase tracking-[0.07em] text-[#667085]">{k}</p>
          <p className="m-0 mt-0.5 text-[0.72rem] font-semibold text-[#1D2226]">{String(v)}</p>
        </div>
      ))}
    </div>
  );
}

// ─── R76 reference row ───────────────────────────────────────────────────────

function ReferenceRow({ ref_ }: { ref_: R76DocumentReference }) {
  const tag = [
    ref_.clause ? `Clause ${ref_.clause}` : null,
    ref_.table ?? null,
    ref_.annex ?? null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 rounded-[3px] border border-[#B9D5EF] bg-[#EAF3FC] px-1.5 py-0.5 text-[0.55rem] font-bold text-[#004182]">
        {tag || ref_.document}
      </span>
      <p className="m-0 text-[0.68rem] leading-snug text-[#475467]">
        <span className="font-semibold text-[#1D2226]">{ref_.document}</span>
        {tag ? ` — ${tag}` : ''}
        {ref_.purpose ? `: ${ref_.purpose}` : ''}
      </p>
    </div>
  );
}

// ─── Formula step ────────────────────────────────────────────────────────────

function FormulaStep({ step }: { step: { label: string; formula: string; substitutedFormula: string; result: number; unit: string; reference?: R76DocumentReference } }) {
  return (
    <div className="rounded-[4px] border border-[#E4EAF0] bg-white p-2.5">
      <p className="m-0 text-[0.6rem] font-bold uppercase tracking-[0.08em] text-[#667085]">{step.label}</p>
      {/* Abstract formula */}
      <p className="m-0 mt-1 font-mono text-[0.72rem] text-[#344054]">{step.formula}</p>
      {/* Substituted formula */}
      <p className="m-0 mt-0.5 font-mono text-[0.72rem] text-[#475467]">{step.substitutedFormula}</p>
      {/* Result */}
      <p className="m-0 mt-1 font-mono text-[0.8rem] font-bold text-[#1D2226]">
        = {step.result} {step.unit}
      </p>
      {step.reference && (
        <p className="m-0 mt-1 border-l-2 border-[#0A66C2] pl-1.5 text-[0.58rem] font-semibold text-[#004182]">
          {step.reference.document}
          {step.reference.annex ? ` — ${step.reference.annex}` : ''}
          {step.reference.clause ? ` — Clause ${step.reference.clause}` : ''}
        </p>
      )}
    </div>
  );
}

// ─── MPE breakdown ───────────────────────────────────────────────────────────

function MPETraceView({ mpe }: { mpe: import('@/lib/r76/types').MPETraceDetail }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        <MPEField label="Accuracy Class" value={mpe.accuracyClass} />
        <MPEField label="Load (kg)" value={mpe.load} />
        <MPEField label="e (kg)" value={mpe.e} />
        <MPEField label="Load / e" value={`${mpe.loadOverE}e`} />
        <MPEField label="Table 6 Band" value={mpe.tableBand} />
        <MPEField label="MPE Factor" value={mpe.mpeFactor} />
        <MPEField label="Base MPE (kg)" value={mpe.baseMPE} />
        <MPEField label="Context" value={mpe.verificationContext} />
        <MPEField label="Context Multiplier" value={`× ${mpe.contextMultiplier}`} />
        <MPEField label="Effective MPE (kg)" value={`±${mpe.effectiveMPE}`} emphasis />
      </div>
      <p className="m-0 border-l-2 border-[#0A66C2] pl-2 text-[0.6rem] font-semibold text-[#004182]">
        {mpe.reference.document} — {mpe.reference.table}, {mpe.reference.clause ? `Clause ${mpe.reference.clause}` : ''}
      </p>
    </div>
  );
}

function MPEField({ label, value, emphasis }: { label: string; value: string | number; emphasis?: boolean }) {
  return (
    <div>
      <p className="m-0 text-[0.57rem] font-bold uppercase tracking-[0.07em] text-[#667085]">{label}</p>
      <p className={`m-0 mt-0.5 font-semibold text-[#1D2226] ${emphasis ? 'text-[0.8rem]' : 'text-[0.72rem]'}`}>
        {String(value)}
      </p>
    </div>
  );
}

// ─── Final comparison ─────────────────────────────────────────────────────────

function ComparisonView({ comparison }: { comparison: { formula: string; substituted: string; passed: boolean } }) {
  const passColor = comparison.passed ? 'text-[#027A48]' : 'text-[#B42318]';
  const passBg = comparison.passed ? 'border-[#ABEFC6] bg-[#ECFDF3]' : 'border-[#FECDCA] bg-[#FEF3F2]';
  return (
    <div className={`rounded-[4px] border px-3 py-2 ${passBg}`}>
      <p className="m-0 font-mono text-[0.72rem] text-[#475467]">{comparison.formula}</p>
      <p className={`m-0 mt-0.5 font-mono text-[0.8rem] font-bold ${passColor}`}>{comparison.substituted}</p>
      <p className={`m-0 mt-1 text-[0.72rem] font-bold uppercase tracking-[0.06em] ${passColor}`}>
        {comparison.passed ? '✓ PASS' : '✗ FAIL / EXCEEDS MPE'}
      </p>
    </div>
  );
}
