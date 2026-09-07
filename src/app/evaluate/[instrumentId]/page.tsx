import type { Metadata } from 'next';

import { AppHeader } from '@/components/AppHeader';
import { EvaluationScreen } from '@/components/Evaluation/EvaluationScreen';

export const metadata: Metadata = {
  title: 'Laboratory Evaluation',
  description: 'OIML R76 laboratory evaluation for a registered weighing instrument.',
};

interface EvaluationPageProps {
  params: Promise<{ instrumentId: string }>;
  searchParams: Promise<{ sessionId?: string | string[] }>;
}

export default async function EvaluationPage({ params, searchParams }: EvaluationPageProps) {
  const { instrumentId } = await params;
  const { sessionId: rawSessionId } = await searchParams;
  const sessionId = typeof rawSessionId === 'string' ? rawSessionId.trim() : '';

  return (
    <main id="main-content" className="min-h-screen bg-[#F7F9FB]">
      <AppHeader backHref="/" section="Evaluation Workspace" />
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-6 border-l-[3px] border-[#0A66C2] pl-4">
          <p className="m-0 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[#0A66C2]">Evaluation workspace</p>
          <h1 className="m-0 mt-1 text-[1.35rem] font-bold tracking-[-0.02em] text-[#1D2226] sm:text-[1.55rem]">Laboratory compliance assessment</h1>
          <p className="m-0 mt-1 max-w-3xl text-[0.8rem] leading-relaxed text-[#667085]">Record guided observations for the selected instrument. The R76 engine determines applicable tests and returns traceable decisions.</p>
        </div>
        <EvaluationScreen instrumentId={instrumentId} sessionId={sessionId} />
      </div>
    </main>
  );
}
