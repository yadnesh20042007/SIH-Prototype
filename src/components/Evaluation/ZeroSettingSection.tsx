import { createDefaultZeroSetting, type ZeroSettingFormState } from './types';
import { DemoDataBanner } from './DemoDataBanner';

export interface ZeroSettingSectionProps {
  value: ZeroSettingFormState;
  onChange: (value: ZeroSettingFormState) => void;
  onLoadDemoData?: () => void;
  isDemoData?: boolean;
  isDemoModified?: boolean;
  onClearDemoData?: () => void;
}

export function ZeroSettingSection({
  value,
  onChange,
  onLoadDemoData,
  isDemoData,
  isDemoModified,
  onClearDemoData,
}: ZeroSettingSectionProps) {
  return (
    <section aria-labelledby="zero-setting-heading" className="rounded-lg border border-[#D9E2EC] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9E2EC] bg-[#F9FBFC] px-5 py-3">
        <div>
          <h2 id="zero-setting-heading" className="m-0 text-[0.8rem] font-bold text-[#101828]">Zero-Setting Accuracy</h2>
          <p className="mt-0.5 text-[0.66rem] text-[#667085]">
            Verify the error at zero according to OIML R76-1 Annex A.4.2.3.
          </p>
        </div>
        {onLoadDemoData && (
          <button
            type="button"
            onClick={onLoadDemoData}
            className="rounded-[5px] border border-[#A9C9E8] bg-[#F6FAFE] px-3 py-1.5 text-[0.72rem] font-bold text-[#0A66C2] transition-colors hover:border-[#0A66C2] hover:bg-[#EAF3FC]"
          >
            Load Demo Data
          </button>
        )}
      </div>

      <div className="p-5">
        {isDemoData && <DemoDataBanner onClear={onClearDemoData} isModified={isDemoModified} />}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4">
          <label className="grid gap-1">
            <span className="text-[0.66rem] font-bold uppercase tracking-[0.06em] text-[#344054]">Load L (kg)</span>
            <input
              type="number"
              step="any"
              className="h-8 rounded-[5px] border border-[#D9E2EC] bg-[#F9FBFC] px-2.5 text-[0.76rem] text-[#101828] shadow-sm focus:border-[#0A66C2] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0A66C2]"
              value={value.load}
              onChange={(e) => onChange({ ...value, load: e.target.value })}
              placeholder="e.g. 10e"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[0.66rem] font-bold uppercase tracking-[0.06em] text-[#344054]">Indication I (kg)</span>
            <input
              type="number"
              step="any"
              className="h-8 rounded-[5px] border border-[#D9E2EC] bg-[#F9FBFC] px-2.5 text-[0.76rem] text-[#101828] shadow-sm focus:border-[#0A66C2] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0A66C2]"
              value={value.indicatedValue}
              onChange={(e) => onChange({ ...value, indicatedValue: e.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[0.66rem] font-bold uppercase tracking-[0.06em] text-[#344054]">Add. Load ΔL (kg)</span>
            <input
              type="number"
              step="any"
              className="h-8 rounded-[5px] border border-[#D9E2EC] bg-[#F9FBFC] px-2.5 text-[0.76rem] text-[#101828] shadow-sm focus:border-[#0A66C2] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0A66C2]"
              value={value.additionalLoad}
              onChange={(e) => onChange({ ...value, additionalLoad: e.target.value })}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
