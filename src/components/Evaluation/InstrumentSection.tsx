'use client';

import { AccuracyClass, VerificationContext, normalizeVerificationContext } from '@/lib/r76/types';
import { Card, Field, TextInput, Select, Checkbox } from '@/components/ui/FormField';
import { ComplianceIcon } from '@/components/ui/ComplianceIcon';
import type { InstrumentFormState } from './types';

const ACCURACY_CLASS_OPTIONS = [
  { value: AccuracyClass.I, label: 'I — Special accuracy' },
  { value: AccuracyClass.II, label: 'II — High accuracy' },
  { value: AccuracyClass.III, label: 'III — Medium accuracy' },
  { value: AccuracyClass.IIII, label: 'IIII — Ordinary accuracy' },
];

const VERIFICATION_CONTEXT_OPTIONS = [
  { value: VerificationContext.TypeEvaluation, label: 'Type Evaluation' },
  { value: VerificationContext.InitialVerification, label: 'Initial Verification' },
  { value: VerificationContext.SubsequentVerification, label: 'Subsequent Verification' },
  { value: VerificationContext.ServiceInspection, label: 'Service Inspection' },
];

const INDICATION_TYPE_OPTIONS = [
  { value: '', label: 'Unspecified' },
  { value: 'DIGITAL', label: 'Digital' },
  { value: 'ANALOG', label: 'Analog' },
];

interface InstrumentSectionProps {
  value: InstrumentFormState;
  onChange: (next: InstrumentFormState) => void;
  verificationContext: VerificationContext | string;
  onVerificationContextChange?: (context: VerificationContext) => void;
  isContextReadOnly?: boolean;
}

function GroupHeading({ children }: { children: string }) {
  return <h3 className="m-0 mb-3 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#004182]">{children}</h3>;
}

export function InstrumentSection({ value, onChange, verificationContext, onVerificationContextChange }: InstrumentSectionProps) {
  function set<K extends keyof InstrumentFormState>(key: K, val: InstrumentFormState[K]) {
    onChange({ ...value, [key]: val });
  }

  return (
    <Card title="Instrument Configuration" sectionLabel="Step 01" subtitle="Record the identity, metrological characteristics, and fitted instrument devices." icon={<ComplianceIcon name="instrument" />}>
      <div className="grid gap-5">
        <div>
          <GroupHeading>Instrument Identity</GroupHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Manufacturer"><TextInput value={value.manufacturer} onChange={(v) => set('manufacturer', v)} placeholder="e.g. Avery" /></Field>
            <Field label="Model"><TextInput value={value.model} onChange={(v) => set('model', v)} placeholder="e.g. AVX-500" /></Field>
            <Field label="Serial Number" hint="Optional for the current prototype"><TextInput value={value.serialNumber} onChange={(v) => set('serialNumber', v)} placeholder="Optional" /></Field>
          </div>
        </div>

        <div className="border-t border-[#E4EAF0] pt-4">
          <GroupHeading>Metrological Characteristics</GroupHeading>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Field label="Accuracy Class"><Select value={value.accuracyClass} onChange={(v) => set('accuracyClass', v as AccuracyClass)} options={ACCURACY_CLASS_OPTIONS} /></Field>
            <Field label="Max (kg)" hint="Maximum capacity"><TextInput type="number" value={value.max} onChange={(v) => set('max', v)} placeholder="30" /></Field>
            <Field label="Min (kg)" hint="Minimum capacity"><TextInput type="number" value={value.min} onChange={(v) => set('min', v)} placeholder="0.2" /></Field>
            <Field label="Verification Interval (e, kg)"><TextInput type="number" step="any" value={value.e} onChange={(v) => set('e', v)} placeholder="0.01" /></Field>
            <Field label="Actual Interval (d, kg)"><TextInput type="number" step="any" value={value.d} onChange={(v) => set('d', v)} placeholder="0.005" /></Field>
          </div>
        </div>

        <div className="border-t border-[#E4EAF0] pt-4">
          <GroupHeading>Instrument Configuration</GroupHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Instrument Type" hint="Registry value; the current evaluation engine supports single-range NAWI only"><TextInput value={value.instrumentType.replaceAll('_', ' ')} onChange={() => {}} disabled /></Field>
            <Field label="Indication Type" hint="Required for digital discrimination test"><Select value={value.indicationType ? value.indicationType.toUpperCase() : ''} onChange={(v) => set('indicationType', (v || null) as any)} options={INDICATION_TYPE_OPTIONS} /></Field>
            <Field label="Verification Context" hint="Active session procedure context"><Select value={normalizeVerificationContext(verificationContext)} onChange={(v) => onVerificationContextChange?.(v as VerificationContext)} options={VERIFICATION_CONTEXT_OPTIONS} disabled /></Field>
            <Field label="Initial Zero-Setting Range (fraction of Max, 0.00–1.00)" hint={value.hasInitialZeroSettingDevice ? 'Enter as fraction of Max (e.g. 0.20 for 20% of Max per R76-1 §4.5)' : 'Enable the device to enter a range'} error={value.hasInitialZeroSettingDevice && (Number(value.initialZeroSettingRange) > 1 || Number(value.initialZeroSettingRange) < 0) ? 'Must be between 0.00 and 1.00 (fraction of Max)' : undefined}><TextInput type="number" step="any" value={value.initialZeroSettingRange} onChange={(v) => set('initialZeroSettingRange', v)} disabled={!value.hasInitialZeroSettingDevice} placeholder="0.20" hasError={value.hasInitialZeroSettingDevice && (Number(value.initialZeroSettingRange) > 1 || Number(value.initialZeroSettingRange) < 0)} /></Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 rounded-md border border-[#D9E2EC] bg-[#F8FAFC] p-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <Checkbox label="Additive Tare Effect" checked={value.additiveTareEffect} onChange={(v) => set('additiveTareEffect', v)} hint="Instrument has additive tare capability" />
            <Checkbox label="Auto-Zero / Zero-Tracking" checked={value.hasAutoZeroOrTracking} onChange={(v) => set('hasAutoZeroOrTracking', v)} hint="Automatic zero or zero-tracking fitted" />
            <Checkbox label="Initial Zero-Setting Device" checked={value.hasInitialZeroSettingDevice} onChange={(v) => set('hasInitialZeroSettingDevice', v)} hint="Initial zero-setting device fitted" />
            <Checkbox label="Fine Display Device" checked={value.hasFineDisplayDevice} onChange={(v) => set('hasFineDisplayDevice', v)} hint="Fine indication facility fitted" />
          </div>
          
          <GroupHeading>Zero-Setting Mechanisms</GroupHeading>
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-md border border-[#D9E2EC] bg-[#F8FAFC] p-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <Checkbox label="Non-Automatic" checked={value.zeroSettingMechanisms.includes('NON_AUTOMATIC')} onChange={(v) => {
              const current = new Set(value.zeroSettingMechanisms);
              if (v) current.add('NON_AUTOMATIC'); else current.delete('NON_AUTOMATIC');
              set('zeroSettingMechanisms', Array.from(current));
            }} hint="Non-automatic zero-setting" />
            <Checkbox label="Semi-Automatic" checked={value.zeroSettingMechanisms.includes('SEMI_AUTOMATIC')} onChange={(v) => {
              const current = new Set(value.zeroSettingMechanisms);
              if (v) current.add('SEMI_AUTOMATIC'); else current.delete('SEMI_AUTOMATIC');
              set('zeroSettingMechanisms', Array.from(current));
            }} hint="Semi-automatic zero-setting" />
            <Checkbox label="Automatic" checked={value.zeroSettingMechanisms.includes('AUTOMATIC')} onChange={(v) => {
              const current = new Set(value.zeroSettingMechanisms);
              if (v) current.add('AUTOMATIC'); else current.delete('AUTOMATIC');
              set('zeroSettingMechanisms', Array.from(current));
            }} hint="Automatic zero-setting" />
            <Checkbox label="Zero-Tracking" checked={value.zeroSettingMechanisms.includes('ZERO_TRACKING')} onChange={(v) => {
              const current = new Set(value.zeroSettingMechanisms);
              if (v) current.add('ZERO_TRACKING'); else current.delete('ZERO_TRACKING');
              set('zeroSettingMechanisms', Array.from(current));
            }} hint="Zero-tracking device" />
          </div>
        </div>
      </div>
    </Card>
  );
}
