'use client';

import type { LoadingDirection } from '@/lib/r76/types';

import {
  Card,
  Field,
  TextInput,
  Select,
  GhostButton,
} from '@/components/ui/FormField';
import { ComplianceIcon } from '@/components/ui/ComplianceIcon';

import {
  createWeighingRow,
  type WeighingRowState,
} from './types';

const DIRECTION_OPTIONS = [
  {
    value: 'increasing',
    label: 'Increasing',
  },
  {
    value: 'decreasing',
    label: 'Decreasing',
  },
];

interface WeighingPerformanceSectionProps {
  rows: WeighingRowState[];
  onChange: (rows: WeighingRowState[]) => void;
  nextId: () => string;
}

export function WeighingPerformanceSection({
  rows,
  onChange,
  nextId,
}: WeighingPerformanceSectionProps) {
  function updateRow(
    id: string,
    patch: Partial<WeighingRowState>
  ) {
    onChange(
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              ...patch,
            }
          : row
      )
    );
  }

  function addRow() {
    onChange([
      ...rows,
      createWeighingRow(nextId()),
    ]);
  }

  function removeRow(id: string) {
    onChange(
      rows.filter((row) => row.id !== id)
    );
  }

  return (
    <Card
      title="Weighing Performance"
      sectionLabel="Step 02 · Test observations"
      icon={<ComplianceIcon name="weighing" />}
      subtitle="Record each applied load and corresponding instrument indication."
      action={
        <GhostButton onClick={addRow}>
          + Add observation
        </GhostButton>
      }
    >
      {rows.length === 0 && (
        <p className="text-[0.75rem] text-[#667085] italic">
          No observations yet — add at least one.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="rounded-md border border-[#D9E2EC] bg-[#F9FBFC] p-3.5"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[#667085]">
                Observation #{index + 1}
              </span>

              <GhostButton
                danger
                onClick={() => removeRow(row.id)}
              >
                Remove
              </GhostButton>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Field
                label="Load L (kg)"
                hint="Applied test load"
              >
                <TextInput
                  type="number"
                  step="any"
                  value={row.load}
                  onChange={(v) =>
                    updateRow(row.id, {
                      load: v,
                    })
                  }
                />
              </Field>

              <Field
                label="Indicated Value I (kg)"
                hint="Instrument indication at the applied load"
              >
                <TextInput
                  type="number"
                  step="any"
                  value={row.indicatedValue}
                  onChange={(v) =>
                    updateRow(row.id, {
                      indicatedValue: v,
                    })
                  }
                />
              </Field>

              <Field
                label="Additional Load ΔL (kg)"
                hint="Additional load used for corrected indication calculation"
              >
                <TextInput
                  type="number"
                  step="any"
                  value={row.additionalLoad}
                  onChange={(v) =>
                    updateRow(row.id, {
                      additionalLoad: v,
                    })
                  }
                />
              </Field>

              <Field
                label="Zero Error E0 (kg)"
                hint="Zero error used for corrected error calculation"
              >
                <TextInput
                  type="number"
                  step="any"
                  value={row.zeroError}
                  onChange={(v) =>
                    updateRow(row.id, {
                      zeroError: v,
                    })
                  }
                />
              </Field>

              <Field label="Loading Direction">
                <Select
                  value={row.loadingDirection}
                  onChange={(v) =>
                    updateRow(row.id, {
                      loadingDirection:
                        v as LoadingDirection,
                    })
                  }
                  options={DIRECTION_OPTIONS}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
