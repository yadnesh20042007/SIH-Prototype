/**
 * @file StatusBadge.tsx
 * @description Renders a colour-coded badge for any status/outcome string
 * returned verbatim by the R76 backend engine — TestOutcome ('pass' |
 * 'fail' | 'requires_retest'), EvaluatedTestStatus ('passed' | 'failed' |
 * 'requires_retest' | 'incomplete' | 'manual_review'), or OverallOutcome
 * ('pass' | 'fail' | 'requires_retest' | 'incomplete' | 'manual_review').
 *
 * This component only formats strings the backend already produced —
 * it never derives or infers a compliance outcome itself.
 */

type KnownStatus =
  | 'pass'
  | 'passed'
  | 'fail'
  | 'failed'
  | 'requires_retest'
  | 'incomplete'
  | 'manual_review';

const STYLES: Record<KnownStatus, string> = {
  pass: 'bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]',
  passed: 'bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]',
  fail: 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]',
  failed: 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]',
  requires_retest: 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]',
  incomplete: 'bg-[#F2F4F7] text-[#475467] border-[#D0D5DD]',
  manual_review: 'bg-[#F4F3FF] text-[#5925DC] border-[#D9D6FE]',
};

const DEFAULT_STYLE = 'bg-[#F2F4F7] text-[#475467] border-[#D0D5DD]';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const style = STYLES[status as KnownStatus] ?? DEFAULT_STYLE;
  const label = status.replace(/_/g, ' ').toUpperCase();

  const sizeClasses =
    size === 'lg'
      ? 'text-[0.8rem] px-3.5 py-1.5'
      : size === 'sm'
        ? 'text-[0.65rem] px-2 py-0.5'
        : 'text-[0.72rem] px-3 py-1';

  return (
    <span
      className={`inline-flex items-center rounded-[4px] border font-bold tracking-[0.05em] ${style} ${sizeClasses}`}
    >
      {label}
    </span>
  );
}
