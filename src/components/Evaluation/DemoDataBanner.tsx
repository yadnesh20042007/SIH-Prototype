'use client';

import React from 'react';

interface DemoDataBannerProps {
  onClear?: () => void;
  className?: string;
  isModified?: boolean;
}

/**
 * Displayed when demo data has been loaded into a test module or workspace.
 * Fulfills Requirement 5: "Clearly identify generated values with a visible label:
 * DEMO DATA — Sample readings generated for demonstration."
 */
export function DemoDataBanner({ onClear, className = '', isModified = false }: DemoDataBannerProps) {
  return (
    <div
      role="status"
      aria-label="Demo data active"
      className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border ${
        isModified ? 'border-[#FDBA74] bg-[#FFF7ED] text-[#9A3412]' : 'border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]'
      } px-3.5 py-2.5 text-[0.75rem] ${className}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded ${
            isModified ? 'bg-[#EA580C]' : 'bg-[#F59E0B]'
          } px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-white`}
        >
          {isModified ? 'Demo (Edited)' : 'Demo'}
        </span>
        <span className={`font-semibold ${isModified ? 'text-[#9A3412]' : 'text-[#78350F]'}`}>
          {isModified
            ? 'DEMO DATA (MANUALLY EDITED) — Sample readings contain manual modifications.'
            : 'DEMO DATA — Sample readings generated for demonstration.'}
        </span>
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className={`text-[0.7rem] font-bold ${
            isModified ? 'text-[#C2410C] hover:text-[#7C2D12]' : 'text-[#B45309] hover:text-[#78350F]'
          } underline`}
        >
          Clear sample readings
        </button>
      )}
    </div>
  );
}

