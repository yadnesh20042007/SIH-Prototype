'use client';

import { useEffect } from 'react';
import type { AccuracyClass } from '@/lib/r76/types';

import {
  Card,
  Field,
  TextInput,
  Checkbox,
} from '@/components/ui/FormField';
import { ComplianceIcon } from '@/components/ui/ComplianceIcon';

import {
  requiredIndicationCount,
  resizeIndications,
  type RepeatabilityFormState,
} from './types';

interface RepeatabilitySectionProps {
  value: RepeatabilityFormState;
  onChange: (next: RepeatabilityFormState) => void;
  accuracyClass: AccuracyClass;
  instrumentHasAutoZero: boolean;
}

export function RepeatabilitySection({
  value,
  onChange,
  accuracyClass,
  instrumentHasAutoZero,
}: RepeatabilitySectionProps) {
  const required = requiredIndicationCount(accuracyClass);

  // UI convenience only:
  // show the number of indication inputs expected for the selected class.
  // The backend independently validates the actual compliance requirement.
  useEffect(() => {
    if (value.indications.length !== required) {
      onChange({
        ...value,
        indications: resizeIndications(
          value.indications,
          required
        ),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [required]);

  function setIndication(
    index: number,
    val: string
  ) {
    const next = [...value.indications];

    next[index] = val;

    onChange({
      ...value,
      indications: next,
    });
  }

  return (
    <Card
      title="Repeatability"
      sectionLabel="Step 03 · Test observations"
      icon={<ComplianceIcon name="repeatability" />}
      subtitle={`Record ${required} repeated indications at the selected test load for Accuracy Class ${accuracyClass}.`}
    >
      <div className="mb-4 grid grid-cols-1 gap-4 rounded-md border border-[#D9E2EC] bg-[#F9FBFC] p-3.5 sm:grid-cols-2">
        <Field
          label="Test Load (kg)"
          hint="For the current prototype, use the repeatability test load required by the backend test procedure."
        >
          <TextInput
            type="number"
            step="any"
            value={value.testLoad}
            onChange={(v) =>
              onChange({
                ...value,
                testLoad: v,
              })
            }
            placeholder="e.g. 24"
          />
        </Field>

        <div className="flex items-end pb-1.5">
          <Checkbox
            label="Auto-zero / zero-tracking active during test"
            checked={value.autoZeroOrTrackingActive}
            onChange={(v) =>
              onChange({
                ...value,
                autoZeroOrTrackingActive: v,
              })
            }
            hint={
              instrumentHasAutoZero
                ? 'Instrument is marked as equipped with auto-zero / zero-tracking.'
                : 'Instrument is not marked as equipped with auto-zero / zero-tracking.'
            }
          />
        </div>
      </div>

      <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#004182]">
        Repeated Indications (kg)
      </span>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {value.indications.map(
          (indication, index) => (
            <Field
              key={index}
              label={`#${index + 1}`}
            >
              <TextInput
                type="number"
                step="any"
                value={indication}
                onChange={(v) =>
                  setIndication(index, v)
                }
              />
            </Field>
          )
        )}
      </div>
    </Card>
  );
}
