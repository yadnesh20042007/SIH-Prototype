import type { ReportRepositoryRecord } from '@/lib/services/report.service';

export function reportActionUrls(report: ReportRepositoryRecord) {
  const viewPdf = `/api/reports/${encodeURIComponent(report.id)}/pdf`;
  return {
    viewPdf,
    downloadPdf: `${viewPdf}?download=1`,
    verifyReport: report.verificationUrl,
  };
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
}

const actionClass = 'font-semibold text-[#0A66C2] underline-offset-2 hover:underline';

export function ReportRepository({ reports }: { reports: ReportRepositoryRecord[] }) {
  if (!reports.length) {
    return <div className="rounded-md border border-[#D9E2EC] bg-white px-5 py-10 text-center"><p className="m-0 text-sm font-semibold text-[#344054]">No reports found</p><p className="m-0 mt-1 text-xs text-[#667085]">Adjust the search or state filter to view other generated reports.</p></div>;
  }

  return <div className="overflow-hidden rounded-md border border-[#D9E2EC] bg-white"><div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead className="bg-[#F7F9FB] text-[0.68rem] uppercase tracking-wide text-[#667085]"><tr>{['Report', 'Instrument', 'Class', 'Issued', 'Outcome', 'State', 'Actions'].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{reports.map(report => {
    const actions = reportActionUrls(report);
    const revoked = report.revokedAt !== null;
    return <tr key={report.id} className="border-t border-[#E4EAF0] align-top text-[#344054]">
      <td className="px-4 py-3"><p className="m-0 font-semibold text-[#1D2226]">{report.referenceNumber}</p><p className="m-0 mt-1 text-xs text-[#667085]">Version {report.version}</p></td>
      <td className="px-4 py-3"><p className="m-0 font-semibold">{report.manufacturer}</p><p className="m-0 mt-1 text-xs text-[#667085]">{report.instrumentModel} · {report.instrumentType.replaceAll('_', ' ')}</p></td>
      <td className="px-4 py-3">{report.accuracyClass}</td><td className="px-4 py-3 whitespace-nowrap">{dateLabel(report.issuedAt)}</td>
      <td className="px-4 py-3 font-semibold">{report.complianceOutcome.replaceAll('_', ' ')}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${revoked ? 'bg-[#FEF3F2] text-[#B42318]' : 'bg-[#ECFDF3] text-[#027A48]'}`}>{revoked ? 'Revoked' : 'Active'}</span></td>
      <td className="px-4 py-3"><div className="flex min-w-52 flex-wrap gap-x-4 gap-y-2">{revoked ? <><span className="text-[#98A2B3]">View PDF</span><span className="text-[#98A2B3]">Download PDF</span></> : <><a className={actionClass} href={actions.viewPdf} target="_blank" rel="noreferrer">View PDF</a><a className={actionClass} href={actions.downloadPdf}>Download PDF</a></>}<a className={actionClass} href={actions.verifyReport} target="_blank" rel="noreferrer">Verify Report</a></div></td>
    </tr>;
  })}</tbody></table></div></div>;
}
