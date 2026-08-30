type ComplianceIconName = 'instrument' | 'weighing' | 'repeatability' | 'eccentric' | 'selection' | 'result';

export function ComplianceIcon({ name }: { name: ComplianceIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" {...common}>
      {name === 'instrument' && <><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M8 9h8M8 13h3M14 13h2M8 16h8" /></>}
      {name === 'weighing' && <><path d="M12 4v15M6 7h12M4 19h16" /><path d="m6 7-3 6h6L6 7Zm12 0-3 6h6l-3-6Z" /></>}
      {name === 'repeatability' && <><path d="M7 7h9a4 4 0 0 1 4 4v1M17 4l-3 3 3 3" /><path d="M17 17H8a4 4 0 0 1-4-4v-1M7 20l3-3-3-3" /></>}
      {name === 'eccentric' && <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M12 4v16M4 12h16" /><circle cx="16" cy="8" r="1.5" /></>}
      {name === 'selection' && <><path d="m5 7 2 2 4-4M5 13l2 2 4-4M14 7h5M14 13h5M5 19h14" /></>}
      {name === 'result' && <><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v5h5M10 13h6M10 17h6" /></>}
    </svg>
  );
}
