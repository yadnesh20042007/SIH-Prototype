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
import { validateEccentricLoadInput } from '@/lib/r76/calculations/eccentricity';

interface EccentricLoadingSectionProps {
  rows: EccentricRowState[];
  onChange: (rows: EccentricRowState[]) => void;

  zeroDeterminedBeforeEachLoading: boolean;
  onZeroDeterminedChange: (val: boolean) => void;

  instrumentHasAutoZero: boolean;
  numberOfSupportPoints?: number;
  instrumentMax?: number;
  instrumentE?: number;

  nextId?: () => string;
}

export function EccentricLoadingSection({
  rows,
  onChange,
  zeroDeterminedBeforeEachLoading,
  onZeroDeterminedChange,
  instrumentHasAutoZero,
  numberOfSupportPoints,
  instrumentMax,
  instrumentE,
  nextId,
}: EccentricLoadingSectionProps) {
  const points = numberOfSupportPoints && numberOfSupportPoints > 0 ? numberOfSupportPoints : 4;
  const prescribedLoad = instrumentMax ? Math.round((instrumentMax / 3) * 1e4) / 1e4 : undefined;
  const requiredPositionsCount = points === 3 ? 3 : 4;
  const expectedPositions = Array.from({ length: requiredPositionsCount }, (_, i) => String(i + 1));

  // Validate applied loads for each row against instrument Max and prescribed load
  const rowValidations = rows.map((r) => {
    const trimmed = String(r.appliedLoad ?? '').trim();
    if (trimmed === '') {
      return { isEmpty: true, isValid: false, error: undefined };
    }
    const val = validateEccentricLoadInput(trimmed, { max: instrumentMax, e: instrumentE });
    return { isEmpty: false, isValid: val.isValid, error: val.error };
  });

  // Only valid observations count toward position completeness
  const validRows = rows.filter((_, idx) => rowValidations[idx].isValid);
  const testedIds = new Set(
    validRows
      .map((r) => r.positionId.trim())
      .filter(Boolean)
  );
  const missingPositions = expectedPositions.filter(
    (exp) =>
      !Array.from(testedIds).some(
        (id) =>
          id === exp ||
          id.toLowerCase() === `position-${exp}` ||
          id.toLowerCase() === `position ${exp}` ||
          id.toLowerCase() === `pos-${exp}` ||
          id.toLowerCase() === `pos${exp}` ||
          id.toLowerCase() === `quarter-${exp}` ||
          id.toLowerCase() === `quarter ${exp}`
      )
  );
  const hasAnyInvalidRow = rowValidations.some((v) => !v.isEmpty && !v.isValid);
  const isComplete = !hasAnyInvalidRow && validRows.length >= requiredPositionsCount && missingPositions.length === 0;

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
    const nextPos = missingPositions.length > 0 ? missingPositions[0] : `${rows.length + 1}`;
    onChange([
      ...rows,
      createEccentricRow(
        nextId ? nextId() : undefined,
        nextPos
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

      {!isComplete ? (
        <div className="mb-4 rounded-md border border-[#F59E0B] bg-[#FFFBEB] p-3.5 text-[0.8rem] text-[#92400E]">
          <div className="flex items-center justify-between font-semibold">
            <span>
              OIML R 76-1 Required Loading Positions: {requiredPositionsCount} (instrument has {points} support points)
              {prescribedLoad !== undefined && ` · Prescribed Load: ${prescribedLoad} kg (1/3 Max)`}
            </span>
            <span className="rounded bg-[#FDE68A] px-2 py-0.5 text-[0.7rem] font-bold text-[#78350F]">
              {validRows.length} of {requiredPositionsCount} valid recorded
            </span>
          </div>
          <p className="mt-1 text-[0.75rem] text-[#B45309]">
            {hasAnyInvalidRow
              ? 'One or more observations use an invalid test load (exceeds instrument Max capacity or does not match prescribed 1/3 Max load). Invalid observations cannot satisfy completeness.'
              : missingPositions.length > 0
              ? `Missing required position(s): ${missingPositions.map((p) => `Position ${p}`).join(', ')}. All required positions must be recorded before compliance evaluation can pass.`
              : `Record at least ${requiredPositionsCount} distinct valid positions to satisfy OIML R 76-1 clause 3.6.2.1 / A.4.7.1.`}
          </p>
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-between rounded-md border border-[#10B981] bg-[#ECFDF5] p-3 text-[0.8rem] text-[#065F46]">
          <span className="font-medium">
            All {requiredPositionsCount} required loading positions configured ({validRows.length} valid recorded)
            {prescribedLoad !== undefined && ` · Prescribed Load: ${prescribedLoad} kg (1/3 Max)`}.
          </span>
          <span className="rounded bg-[#A7F3D0] px-2 py-0.5 text-[0.7rem] font-bold text-[#065F46]">
            COMPLETE
          </span>
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-[0.75rem] text-[#667085] italic">
          No positions yet — add at least one.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const loadError = rowValidations[index]?.error;
          return (
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
                hint={prescribedLoad !== undefined ? `Prescribed load: ${prescribedLoad} kg (1/3 Max)` : "Applied eccentric test load"}
                error={loadError}
              >
                <TextInput
                  type="number"
                  step="any"
                  value={row.appliedLoad}
                  hasError={Boolean(loadError)}
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
          );
        })}
      </div>
    </Card>
  );
}
