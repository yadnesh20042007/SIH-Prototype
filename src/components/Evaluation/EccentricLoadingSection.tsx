'use client';

import {
  Card,
  Field,
  TextInput,
  Checkbox,
  GhostButton,
} from '@/components/ui/FormField';
import { ComplianceIcon } from '@/components/ui/ComplianceIcon';

import {
  createEccentricRow,
  type EccentricRowState,
} from './types';

interface EccentricLoadingSectionProps {
  rows: EccentricRowState[];
  onChange: (rows: EccentricRowState[]) => void;

  zeroDeterminedBeforeEachLoading: boolean;
  onZeroDeterminedChange: (val: boolean) => void;

  instrumentHasAutoZero: boolean;

  nextId: () => string;
}

export function EccentricLoadingSection({
  rows,
  onChange,
  zeroDeterminedBeforeEachLoading,
  onZeroDeterminedChange,
  instrumentHasAutoZero,
  nextId,
}: EccentricLoadingSectionProps) {
  function updateRow(
    id: string,
    patch: Partial<EccentricRowState>
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
      createEccentricRow(
        nextId(),
        `position-${rows.length + 1}`
      ),
    ]);
  }

  function removeRow(id: string) {
    onChange(
      rows.filter((row) => row.id !== id)
    );
  }

  return (
    <Card
      title="Eccentric Loading"
      sectionLabel="Step 04 · Test observations"
      icon={<ComplianceIcon name="eccentric" />}
      subtitle="Record observations for each supported load-receptor position."
      action={
        <GhostButton onClick={addRow}>
          + Add position
        </GhostButton>
      }
    >
      <div className="mb-4 rounded-md border border-[#D9E2EC] bg-[#F9FBFC] p-3.5">
        <Checkbox
          label="Zero determined before each loading"
          checked={zeroDeterminedBeforeEachLoading}
          onChange={onZeroDeterminedChange}
          hint="Used by the backend to determine whether a tolerance breach requires retesting or produces a final failure."
        />
      </div>

      {rows.length === 0 && (
        <p className="text-[0.75rem] text-[#667085] italic">
          No positions yet — add at least one.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-[#D9E2EC] bg-[#F9FBFC] p-3.5"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[#667085]">
                {row.positionId || 'Untitled position'}
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
                label="Position ID"
                hint="Identifier for the load-receptor position"
              >
                <TextInput
                  value={row.positionId}
                  onChange={(v) =>
                    updateRow(row.id, {
                      positionId: v,
                    })
                  }
                />
              </Field>

              <Field
                label="Applied Load L (kg)"
                hint="Applied eccentric test load"
              >
                <TextInput
                  type="number"
                  step="any"
                  value={row.appliedLoad}
                  onChange={(v) =>
                    updateRow(row.id, {
                      appliedLoad: v,
                    })
                  }
                />
              </Field>

              <Field
                label="Indicated Value I (kg)"
                hint="Instrument indication at this position"
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
            </div>

            <div className="mt-3">
              <Checkbox
                label="Auto-zero / zero-tracking disabled for this position"
                checked={
                  row.autoZeroOrTrackingDisabled
                }
                onChange={(v) =>
                  updateRow(row.id, {
                    autoZeroOrTrackingDisabled: v,
                  })
                }
                hint={
                  instrumentHasAutoZero
                    ? 'Instrument is equipped with auto-zero / zero-tracking; record whether it was disabled during this eccentric-loading observation.'
                    : 'Instrument is not marked as equipped with auto-zero / zero-tracking.'
                }
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
