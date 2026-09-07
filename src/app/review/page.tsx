import type { Metadata } from 'next';

import { AppHeader } from '@/components/AppHeader';
import { ApprovalQueueScreen } from '@/components/Approval/ApprovalQueueScreen';

export const metadata: Metadata = { title: 'Session Review' };

export default function ReviewPage() {
  return (
    <main className="min-h-screen bg-[#F7F9FB]">
      <AppHeader section="Technical Review" />
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 border-l-[3px] border-[#0A66C2] pl-4">
          <p className="m-0 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[#0A66C2]">Review</p>
          <h1 className="m-0 mt-1 text-[1.45rem] font-bold text-[#1D2226]">Pending technical review</h1>
          <p className="m-0 mt-1 text-[0.78rem] text-[#667085]">Review persisted engine outcomes and their Compliance Trace before forwarding a session.</p>
        </div>
        <ApprovalQueueScreen mode="review" />
      </div>
    </main>
  );
}
