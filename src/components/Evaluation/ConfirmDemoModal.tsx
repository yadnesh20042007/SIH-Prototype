'use client';

import React from 'react';

interface ConfirmDemoModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation modal to protect existing user-entered data before loading demo data.
 * Fulfills Requirement 4:
 * "If the user has already entered readings:
 *  - Show a confirmation before replacing them.
 *  - Never silently overwrite user-entered data.
 *  - Keep the existing workflow intact."
 */
export function ConfirmDemoModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Load Demo Data',
  cancelLabel = 'Keep My Readings',
  onConfirm,
  onCancel,
}: ConfirmDemoModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-demo-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-xl border border-[#D9E2EC] bg-white p-6 shadow-xl animate-in fade-in duration-150">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FEF3F2] text-[#D92D20]">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <h3 id="confirm-demo-title" className="text-[0.95rem] font-bold text-[#1D2226]">
              {title}
            </h3>
            <p className="mt-1.5 text-[0.78rem] leading-relaxed text-[#667085]">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[5px] border border-[#D0D5DD] bg-white px-4 py-2 text-[0.76rem] font-semibold text-[#344054] shadow-xs transition-colors hover:bg-[#F9FAFB]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-[5px] bg-[#0A66C2] px-4 py-2 text-[0.76rem] font-bold text-white shadow-xs transition-colors hover:bg-[#004182]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

