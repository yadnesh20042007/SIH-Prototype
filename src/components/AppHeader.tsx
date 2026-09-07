import Link from 'next/link';

function LaboratoryMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7" fill="none">
      <path d="M16 5v20M9 9h14M7 25h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m9 9-4 8h8L9 9Zm14 0-4 8h8l-4-8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

interface AppHeaderProps {
  backHref?: string;
  section: string;
}

export function AppHeader({ backHref, section }: AppHeaderProps) {
  const brand = (
    <div className="flex min-w-0 items-center gap-3.5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#0A66C2] text-white">
        <LaboratoryMark />
      </div>
      <div className="min-w-0">
        <p className="m-0 truncate text-[1rem] font-bold leading-tight tracking-[-0.01em] text-[#1D2226] sm:text-[1.08rem]">
          OIML R76 Compliance Testing
        </p>
        <p className="mt-1 hidden text-[0.72rem] leading-tight text-[#667085] sm:block">
          Non-Automatic Weighing Instrument Laboratory Evaluation
        </p>
      </div>
    </div>
  );

  return (
    <header className="border-b border-[#D9E2EC] bg-white">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        {backHref ? (
          <Link href={backHref} className="min-w-0 rounded-sm no-underline">
            {brand}
          </Link>
        ) : brand}
        <div className="flex shrink-0 items-center gap-4 border-l border-[#D9E2EC] pl-4">
          <nav aria-label="Primary" className="flex items-center gap-0.5 sm:gap-1">
            <Link href="/" className="rounded px-2.5 py-1.5 text-[0.7rem] font-semibold text-[#475467] no-underline hover:bg-[#F0F5FA] hover:text-[#0A66C2]">Registry</Link>
            <Link href="/review" className="rounded px-2.5 py-1.5 text-[0.7rem] font-semibold text-[#475467] no-underline hover:bg-[#F0F5FA] hover:text-[#0A66C2]">Review</Link>
            <Link href="/approval" className="rounded px-2.5 py-1.5 text-[0.7rem] font-semibold text-[#475467] no-underline hover:bg-[#F0F5FA] hover:text-[#0A66C2]">Final Approval</Link>
          </nav>
          <div className="hidden text-right xl:block">
            <p className="m-0 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[#667085]">
              {section}
            </p>
            <p className="m-0 mt-0.5 text-[0.72rem] font-semibold text-[#004182]">
              OIML R76-1 (2006)
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
