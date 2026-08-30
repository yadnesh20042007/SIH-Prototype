'use client';

import type { ChangeEvent, ReactNode } from 'react';

interface FieldProps { label: string; hint?: string; children: ReactNode; className?: string; }

export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className ?? ''}`}>
      <span className="text-[0.7rem] font-semibold leading-tight text-[#344054]">{label}</span>
      {children}
      {hint && <span className="text-[0.66rem] leading-snug text-[#7B8794]">{hint}</span>}
    </label>
  );
}

interface TextInputProps { value: string; onChange: (value: string) => void; type?: 'text' | 'number'; placeholder?: string; step?: string; disabled?: boolean; }

export function TextInput({ value, onChange, type = 'text', placeholder, step, disabled }: TextInputProps) {
  return <input type={type} value={value} step={step} placeholder={placeholder} disabled={disabled} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)} className="h-9 w-full rounded-[5px] border border-[#C9D5E1] bg-white px-2.5 text-[0.78rem] text-[#1D2226] shadow-[inset_0_1px_1px_rgba(16,24,40,0.03)] transition-[border-color,box-shadow] placeholder:text-[#98A2B3] hover:border-[#AEBECD] disabled:cursor-not-allowed disabled:bg-[#F2F4F7] disabled:text-[#667085] focus:border-[#0A66C2] focus:outline-none focus:ring-[3px] focus:ring-[#0A66C2]/10" />;
}

interface SelectOption { value: string; label: string; }
interface SelectProps { value: string; onChange: (value: string) => void; options: SelectOption[]; disabled?: boolean; }

export function Select({ value, onChange, options, disabled }: SelectProps) {
  return (
    <select value={value} disabled={disabled} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)} className="h-9 w-full rounded-[5px] border border-[#C9D5E1] bg-white px-2.5 text-[0.78rem] text-[#1D2226] shadow-[inset_0_1px_1px_rgba(16,24,40,0.03)] transition-[border-color,box-shadow] hover:border-[#AEBECD] disabled:cursor-not-allowed disabled:bg-[#F2F4F7] disabled:text-[#667085] focus:border-[#0A66C2] focus:outline-none focus:ring-[3px] focus:ring-[#0A66C2]/10">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

interface CheckboxProps { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string; }

export function Checkbox({ label, checked, onChange, hint }: CheckboxProps) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-2.5">
      <input type="checkbox" checked={checked} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0A66C2]" />
      <span className="flex min-w-0 flex-col">
        <span className="text-[0.75rem] font-medium leading-snug text-[#344054]">{label}</span>
        {hint && <span className="mt-0.5 text-[0.65rem] leading-snug text-[#7B8794]">{hint}</span>}
      </span>
    </label>
  );
}

interface CardProps { title: string; subtitle?: string; children: ReactNode; action?: ReactNode; icon?: ReactNode; sectionLabel?: string; }

export function Card({ title, subtitle, children, action, icon, sectionLabel }: CardProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#D9E2EC] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#E4EAF0] bg-[#FBFCFD] px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-[#CFE1F3] bg-[#EAF3FC] text-[#0A66C2]">{icon}</div>}
          <div className="min-w-0">
            {sectionLabel && <p className="m-0 mb-0.5 text-[0.58rem] font-bold uppercase tracking-[0.13em] text-[#0A66C2]">{sectionLabel}</p>}
            <h2 className="m-0 text-[0.92rem] font-bold tracking-[-0.01em] text-[#1D2226]">{title}</h2>
            {subtitle && <p className="m-0 mt-0.5 max-w-3xl text-[0.7rem] leading-relaxed text-[#667085]">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

interface GhostButtonProps { onClick: () => void; children: ReactNode; danger?: boolean; }

export function GhostButton({ onClick, children, danger }: GhostButtonProps) {
  return <button type="button" onClick={onClick} className={`rounded-[5px] border px-2.5 py-1.5 text-[0.68rem] font-semibold transition-colors ${danger ? 'border-[#F3C7C7] text-[#B42318] hover:bg-[#FEF3F2]' : 'border-[#BFCEDC] bg-white text-[#344054] hover:border-[#0A66C2] hover:bg-[#F6FAFE] hover:text-[#0A66C2]'}`}>{children}</button>;
}
