import type { Metadata } from 'next';

import { AppHeader } from '@/components/AppHeader';
import { ReportRepository } from '@/components/Reports/ReportRepository';
import { requirePageUser } from '@/lib/auth/page-access';
import { listReports, type ReportStateFilter } from '@/lib/services/report.service';

export const metadata: Metadata = { title: 'Report Repository' };

interface ReportsPageProps {
  searchParams: Promise<{ q?: string | string[]; state?: string | string[] }>;
}

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const user = await requirePageUser(['LAB_TECHNICIAN', 'REVIEWING_OFFICER', 'APPROVING_OFFICER', 'ADMIN']);
  const requested = await searchParams;
  const query = single(requested.q).trim().slice(0, 200);
  const requestedState = single(requested.state).toUpperCase();
  const state: ReportStateFilter = ['ACTIVE', 'REVOKED'].includes(requestedState) ? requestedState as ReportStateFilter : 'ALL';
  const reports = await listReports({ query: query || undefined, state });

  return <main className="min-h-screen bg-[#F7F9FB]"><AppHeader section="Reports" user={user} /><div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8"><div className="mb-6 border-l-[3px] border-[#0A66C2] pl-4"><p className="m-0 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[#0A66C2]">Records</p><h1 className="m-0 mt-1 text-[1.45rem] font-bold text-[#1D2226]">Report Repository</h1><p className="m-0 mt-1 text-[0.78rem] text-[#667085]">Search, verify, and retrieve generated approved reports.</p></div>
    <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-md border border-[#D9E2EC] bg-white p-4"><label className="min-w-64 flex-1 text-xs font-semibold text-[#475467]">Search reports<input name="q" defaultValue={query} placeholder="Reference, manufacturer, or model" className="mt-1 w-full rounded border border-[#CBD5E1] px-3 py-2 text-sm font-normal outline-none focus:border-[#0A66C2]" /></label><label className="text-xs font-semibold text-[#475467]">State<select name="state" defaultValue={state} className="mt-1 block rounded border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#0A66C2]"><option value="ALL">All</option><option value="ACTIVE">Active</option><option value="REVOKED">Revoked</option></select></label><button className="rounded bg-[#0A66C2] px-5 py-2 text-sm font-semibold text-white" type="submit">Apply</button><a href="/reports" className="px-3 py-2 text-sm font-semibold text-[#475467] no-underline">Clear</a></form>
    <ReportRepository reports={reports} />
  </div></main>;
}
