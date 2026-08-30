'use client';

import type { ReactNode } from 'react';
import { TestType } from '@/lib/r76/types';
import type { OrchestrationResult, EvaluatedTest } from '@/lib/r76/engine';
import type { WeighingPerformanceTestResult } from '@/lib/r76/calculations/weighing';
import type { RepeatabilityTestResult } from '@/lib/r76/calculations/repeatability';
import type { EccentricityTestResult } from '@/lib/r76/calculations/eccentricity';
import { ComplianceIcon } from '@/components/ui/ComplianceIcon';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface ResultsSectionProps { result: OrchestrationResult | null; error: string | null; loading: boolean; }

const TEST_TYPE_LABEL: Record<TestType, string> = {
  [TestType.WeighingPerformance]: 'Weighing Performance',
  [TestType.Repeatability]: 'Repeatability',
  [TestType.EccentricLoading]: 'Eccentric Loading',
};

export function ResultsSection({ result, error, loading }: ResultsSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <ApplicableTestsPanel result={result} loading={loading} />

      {loading && <StatePanel>Evaluating observations with the R76 compliance engine…</StatePanel>}

      {!loading && error && (
        <section className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-5">
          <p className="m-0 text-[0.78rem] font-bold text-[#B42318]">Evaluation request failed</p>
          <p className="m-0 mt-1 text-[0.75rem] text-[#B42318]">{error}</p>
        </section>
      )}

      {!loading && !error && !result && (
        <StatePanel>Complete the instrument record and observations, then select “Evaluate Compliance” to generate the technical result.</StatePanel>
      )}

      {!loading && !error && result && (
        <>
          <OverallResult result={result} />
          {result.evaluatedTests.map((test) => <TestResultCard key={test.testType} test={test} />)}
        </>
      )}
    </div>
  );
}

function PanelHeader({ icon, eyebrow, title, right }: { icon: ReactNode; eyebrow: string; title: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#E4EAF0] bg-[#FBFCFD] px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-[#CFE1F3] bg-[#EAF3FC] text-[#0A66C2]">{icon}</div>
        <div>
          <p className="m-0 text-[0.58rem] font-bold uppercase tracking-[0.13em] text-[#0A66C2]">{eyebrow}</p>
          <h2 className="m-0 mt-0.5 text-[0.92rem] font-bold text-[#1D2226]">{title}</h2>
        </div>
      </div>
      {right}
    </div>
  );
}

function ApplicableTestsPanel({ result, loading }: { result: OrchestrationResult | null; loading: boolean }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#B9D5EF] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <PanelHeader icon={<ComplianceIcon name="selection" />} eyebrow="Automatic test selection" title="Applicable R76 Tests" />
      {!result ? (
        <div className="px-4 py-5 text-[0.73rem] leading-relaxed text-[#667085]">
          {loading ? 'Determining test applicability from the submitted instrument configuration…' : 'Applicability is determined by the R76 engine when the evaluation is submitted. No rules are inferred in this interface.'}
        </div>
      ) : (
        <div className="divide-y divide-[#E4EAF0]">
          {result.testSelectionResults.map((selection) => (
            <div key={selection.testType} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="m-0 text-[0.75rem] font-semibold text-[#1D2226]">{TEST_TYPE_LABEL[selection.testType]}</p>
                <p className="m-0 mt-0.5 text-[0.67rem] leading-relaxed text-[#667085]">{selection.reason}</p>
                <p className="m-0 mt-1 text-[0.62rem] font-semibold text-[#0A66C2]">{selection.r76Reference}</p>
              </div>
              <span className={`mt-0.5 h-fit rounded-[4px] border px-2 py-1 text-[0.6rem] font-bold uppercase tracking-[0.07em] ${selection.isApplicable ? 'border-[#B9D5EF] bg-[#EAF3FC] text-[#004182]' : 'border-[#D9D6FE] bg-[#F4F3FF] text-[#5925DC]'}`}>
                {selection.isApplicable ? 'Required' : 'Manual Review'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatePanel({ children }: { children: ReactNode }) {
  return <section className="rounded-lg border border-dashed border-[#BFCEDC] bg-white px-6 py-8 text-center text-[0.75rem] leading-relaxed text-[#667085]">{children}</section>;
}

function OverallResult({ result }: { result: OrchestrationResult }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#D9E2EC] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <PanelHeader icon={<ComplianceIcon name="result" />} eyebrow="Compliance decision" title="Overall Compliance Result" right={<StatusBadge status={result.overallOutcome} size="lg" />} />
      <div className="p-4">
        <p className="m-0 border-l-[3px] border-[#0A66C2] pl-3 text-[0.76rem] leading-relaxed text-[#344054]">{result.explanation}</p>
        <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[5px] border border-[#D9E2EC] bg-[#D9E2EC] sm:grid-cols-6">
          <CountTile label="Selected" value={result.counts.selected} />
          <CountTile label="Passed" value={result.counts.passed} tone="green" />
          <CountTile label="Failed" value={result.counts.failed} tone="red" />
          <CountTile label="Retest" value={result.counts.requiresRetest} tone="amber" />
          <CountTile label="Incomplete" value={result.counts.incomplete} />
          <CountTile label="Manual" value={result.counts.manualReview} tone="violet" />
        </div>
      </div>
    </section>
  );
}

function CountTile({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'red' | 'amber' | 'violet' }) {
  const toneClass = tone === 'green' ? 'text-[#027A48]' : tone === 'red' ? 'text-[#B42318]' : tone === 'amber' ? 'text-[#B54708]' : tone === 'violet' ? 'text-[#5925DC]' : 'text-[#344054]';
  return <div className="bg-[#F8FAFC] px-2 py-2.5 text-center"><p className={`m-0 text-[1.05rem] font-bold ${toneClass}`}>{value}</p><p className="m-0 mt-0.5 text-[0.55rem] font-bold uppercase tracking-[0.08em] text-[#667085]">{label}</p></div>;
}

function TestResultCard({ test }: { test: EvaluatedTest }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#D9E2EC] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#E4EAF0] bg-[#FBFCFD] px-4 py-3">
        <h3 className="m-0 text-[0.8rem] font-bold text-[#1D2226]">{TEST_TYPE_LABEL[test.testType]}</h3>
        <StatusBadge status={test.status} />
      </div>
      <div className="p-4">
        {test.status === 'manual_review' && <SelectionNotice test={test} />}
        {test.status === 'incomplete' && !test.result && <IncompleteNotice test={test} />}
        {test.result && test.testType === TestType.WeighingPerformance && <WeighingResultDetail result={test.result as WeighingPerformanceTestResult} />}
        {test.result && test.testType === TestType.Repeatability && <RepeatabilityResultDetail result={test.result as RepeatabilityTestResult} />}
        {test.result && test.testType === TestType.EccentricLoading && <EccentricityResultDetail result={test.result as EccentricityTestResult} />}
      </div>
    </section>
  );
}

function SelectionNotice({ test }: { test: EvaluatedTest }) {
  return <div className="rounded-md border border-[#D9D6FE] bg-[#F9F8FF] p-3"><p className="m-0 text-[0.72rem] text-[#42307D]">{test.selection.reason}</p><Reference value={test.selection.r76Reference} />{test.selection.prerequisites.length > 0 && <PrerequisiteList items={test.selection.prerequisites} />}</div>;
}

function IncompleteNotice({ test }: { test: EvaluatedTest }) {
  return <div className="rounded-md border border-[#D9E2EC] bg-[#F8FAFC] p-3"><p className="m-0 text-[0.72rem] text-[#475467]">{test.errorMessage ?? 'Required observations for this test were not provided.'}</p>{test.selection.prerequisites.length > 0 && <PrerequisiteList items={test.selection.prerequisites} />}</div>;
}

function PrerequisiteList({ items }: { items: string[] }) {
  return <ul className="mb-0 mt-2 list-disc space-y-1 pl-4 text-[0.66rem] leading-relaxed text-[#667085]">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

function WeighingResultDetail({ result }: { result: WeighingPerformanceTestResult }) {
  return (
    <div className="space-y-3">
      <Summary explanation={result.explanation} reference={result.r76Reference}><Metric label="Maximum absolute error" value={`${result.maxAbsoluteError} kg`} /></Summary>
      {result.observationResults.map((observation, index) => (
        <div key={index} className="rounded-md border border-[#D9E2EC]">
          <RowHeader label={`Observation ${index + 1}`} status={observation.outcome} />
          <div className="p-3">
            <Comparison leftLabel="Calculated Error" leftValue={`${observation.calculatedError} kg`} rightLabel="Permissible MPE" rightValue={`±${observation.mpe} kg`} />
            <div className="mt-3 grid grid-cols-2 gap-3"><Metric label="Indication before rounding (P)" value={`${observation.indicationPriorToRounding} kg`} /><Metric label="Error before correction (E)" value={`${observation.errorPriorToRounding} kg`} /></div>
            <Explanation value={observation.explanation} /><Reference value={observation.r76Reference} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RepeatabilityResultDetail({ result }: { result: RepeatabilityTestResult }) {
  return (
    <div>
      <Comparison leftLabel="Observed Range" leftValue={`${result.repeatabilityRange} kg`} rightLabel="Permissible MPE" rightValue={`±${result.mpe} kg`} />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3"><Metric label="Test Load" value={`${result.testLoad} kg`} /><Metric label="Weighings" value={String(result.numberOfWeighings)} /><Metric label="Imax / Imin" value={`${result.iMax} / ${result.iMin} kg`} /></div>
      <Explanation value={result.explanation} /><Reference value={result.r76Reference} />
    </div>
  );
}

function EccentricityResultDetail({ result }: { result: EccentricityTestResult }) {
  return (
    <div className="space-y-3">
      <Summary explanation={result.explanation} reference={result.r76Reference}><Metric label="Maximum absolute error" value={`${result.maxAbsoluteError} kg`} /><Metric label="Retest required" value={result.retestRequired ? 'Yes' : 'No'} /></Summary>
      {result.observationResults.map((position) => (
        <div key={position.positionId} className="rounded-md border border-[#D9E2EC]">
          <RowHeader label={position.positionId} status={position.outcome} />
          <div className="p-3">
            <Comparison leftLabel="Calculated Error" leftValue={`${position.calculatedError} kg`} rightLabel="Permissible MPE" rightValue={`±${position.mpe} kg`} />
            <div className="mt-3 grid grid-cols-2 gap-3"><Metric label="Applied Load (L)" value={`${position.appliedLoad} kg`} /><Metric label="Indicated Value (I)" value={`${position.indicatedValue} kg`} /></div>
            <Explanation value={position.explanation} /><Reference value={position.r76Reference} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RowHeader({ label, status }: { label: string; status: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-[#E4EAF0] bg-[#F8FAFC] px-3 py-2"><span className="text-[0.62rem] font-bold uppercase tracking-[0.09em] text-[#667085]">{label}</span><StatusBadge status={status} size="sm" /></div>;
}

function Comparison({ leftLabel, leftValue, rightLabel, rightValue }: { leftLabel: string; leftValue: string; rightLabel: string; rightValue: string }) {
  return <div className="grid grid-cols-[1fr_auto_1fr] items-stretch overflow-hidden rounded-[5px] border border-[#B9D5EF] bg-[#F6FAFE]"><div className="p-3"><Metric label={leftLabel} value={leftValue} emphasis /></div><div className="flex items-center border-x border-[#B9D5EF] px-2 text-[0.58rem] font-bold uppercase text-[#667085]">vs</div><div className="p-3"><Metric label={rightLabel} value={rightValue} emphasis /></div></div>;
}

function Summary({ explanation, reference, children }: { explanation: string; reference: string; children: ReactNode }) {
  return <div className="rounded-md border border-[#D9E2EC] bg-[#F8FAFC] p-3"><div className="grid grid-cols-2 gap-3">{children}</div><Explanation value={explanation} /><Reference value={reference} /></div>;
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return <div><p className="m-0 text-[0.57rem] font-bold uppercase tracking-[0.08em] text-[#667085]">{label}</p><p className={`m-0 mt-0.5 font-semibold text-[#1D2226] ${emphasis ? 'text-[0.9rem]' : 'text-[0.75rem]'}`}>{value}</p></div>;
}

function Explanation({ value }: { value: string }) { return <p className="m-0 mt-3 text-[0.7rem] leading-relaxed text-[#475467]">{value}</p>; }
function Reference({ value }: { value: string }) { return <p className="m-0 mt-1.5 border-l-2 border-[#0A66C2] pl-2 text-[0.62rem] font-semibold leading-relaxed text-[#004182]">{value}</p>; }
