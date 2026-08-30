import type { Metadata } from 'next';
import { EvaluationScreen } from '@/components/Evaluation/EvaluationScreen';

export const metadata: Metadata = {
  title: 'OIML R76 Compliance Testing',
  description: 'Laboratory evaluation workspace for non-automatic weighing instruments.',
};

function LaboratoryMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7" fill="none">
      <path d="M16 5v20M9 9h14M7 25h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m9 9-4 8h8L9 9Zm14 0-4 8h8l-4-8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export default function EvaluationPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#F7F9FB]">
      <header className="border-b border-[#D9E2EC] bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#0A66C2] text-white">
              <LaboratoryMark />
            </div>
            <div className="min-w-0">
              <p className="m-0 truncate text-[1rem] font-bold leading-tight tracking-[-0.01em] text-[#1D2226] sm:text-[1.08rem]">OIML R76 Compliance Testing</p>
              <p className="mt-1 hidden text-[0.72rem] leading-tight text-[#667085] sm:block">Non-Automatic Weighing Instrument Laboratory Evaluation</p>
            </div>
          </div>
          <div className="shrink-0 border-l border-[#D9E2EC] pl-4 text-right">
            <p className="m-0 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[#667085]">Standard</p>
            <p className="m-0 mt-0.5 text-[0.72rem] font-semibold text-[#004182]">OIML R76-1 (2006)</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-6 border-l-[3px] border-[#0A66C2] pl-4">
          <p className="m-0 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[#0A66C2]">Evaluation workspace</p>
          <h1 className="m-0 mt-1 text-[1.35rem] font-bold tracking-[-0.02em] text-[#1D2226] sm:text-[1.55rem]">Laboratory compliance assessment</h1>
          <p className="m-0 mt-1 max-w-3xl text-[0.8rem] leading-relaxed text-[#667085]">Record the instrument configuration and guided observations. The R76 engine determines applicable tests and returns traceable, explainable decisions.</p>
        </div>
        <EvaluationScreen />
      </div>
    </main>
  );
}
