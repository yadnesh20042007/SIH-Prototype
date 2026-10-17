'use client';

import type { LoadingDirection } from '@/lib/r76/types';
import { validateWeighingLoadInput, fixFloat } from '@/lib/r76/calculations/weighing';

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
  isTypeEvaluationContext,
  type WeighingRowState,
} from './types';
import type { VerificationContext } from '@/lib/r76/types';

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
  nextId?: () => string;
  verificationContext?: string | VerificationContext;
  instrumentMin?: number;
  instrumentMax?: number;
  instrumentE?: number;
}

export function WeighingPerformanceSection({
  rows,
  onChange,
  nextId,
  verificationContext,
  instrumentMin,
  instrumentMax,
  instrumentE,
}: WeighingPerformanceSectionProps) {
  const isTypeEval = isTypeEvaluationContext(verificationContext);
  const requiredMinLoads = isTypeEval ? 10 : 5;

  // Validate each row's load against instrument limits and OIML exceptions
  const rowValidations = rows.map((r) => {
    const trimmed = r.load.trim();
    if (trimmed === '') {
      return { isEmpty: true, isValid: false, error: undefined };
    }
    const val = validateWeighingLoadInput(trimmed, { min: instrumentMin, max: instrumentMax });
    return { isEmpty: false, isValid: val.isValid, error: val.error };
  });

  // Only valid, non-empty observations count toward completeness
  const validRows = rows.filter((_, idx) => rowValidations[idx].isValid);
  const validNumericLoads = validRows.map((r) => Number(r.load));
  const distinctLoads = new Set(validNumericLoads.map((v) => fixFloat(v))).size;

  const incRows = validRows.filter((r) => r.loadingDirection === 'increasing');
  const decRows = validRows.filter((r) => r.loadingDirection === 'decreasing');

  const hasIncreasing = incRows.length > 0;
  const hasDecreasing = decRows.length > 0;

  // Annex A.4.4.1 sequence ordering checks (monotonic non-decreasing / non-increasing, preserving repeated load points)
  let increasingOrdered = true;
  for (let i = 0; i < incRows.length - 1; i++) {
    if (fixFloat(Number(incRows[i + 1].load)) < fixFloat(Number(incRows[i].load))) {
      increasingOrdered = false;
      break;
    }
  }

  let decreasingOrdered = true;
  for (let j = 0; j < decRows.length - 1; j++) {
    if (fixFloat(Number(decRows[j + 1].load)) > fixFloat(Number(decRows[j].load))) {
      decreasingOrdered = false;
      break;
    }
  }

  let sequencePhasingValid = true;
  if (incRows.length > 0 && decRows.length > 0) {
    let lastIncIdx = -1;
    let firstDecIdx = -1;
    for (let k = 0; k < validRows.length; k++) {
      if (validRows[k].loadingDirection === 'increasing') lastIncIdx = k;
      if (validRows[k].loadingDirection === 'decreasing' && firstDecIdx === -1) firstDecIdx = k;
    }
    if (firstDecIdx !== -1 && lastIncIdx !== -1 && firstDecIdx < lastIncIdx) {
      sequencePhasingValid = false;
    }
  }

  const minThreshold = instrumentMin !== undefined
    ? (instrumentE !== undefined ? instrumentMin + instrumentE : (instrumentMin >= 0.0001 ? instrumentMin * 1.5 : instrumentMin))
    : 0;
  const minReached =
    instrumentMin !== undefined &&
    validNumericLoads.length > 0 &&
    Math.min(...validNumericLoads) <= minThreshold;

  const maxThreshold = instrumentMax !== undefined
    ? (instrumentE !== undefined ? instrumentMax - instrumentE : instrumentMax * 0.95)
    : 0;
  // A load above Max must not satisfy the Max requirement. Only valid observations reaching Max count.
  const maxReached =
    instrumentMax !== undefined &&
    validNumericLoads.length > 0 &&
    validNumericLoads.some((load) => load <= instrumentMax && load >= maxThreshold);

  const hasAnyInvalidRow = rowValidations.some((v) => !v.isEmpty && !v.isValid);

  const isComplete =
    !hasAnyInvalidRow &&
    distinctLoads >= requiredMinLoads &&
    hasIncreasing &&
    hasDecreasing &&
    increasingOrdered &&
    decreasingOrdered &&
    sequencePhasingValid &&
    (instrumentMin === undefined || minReached) &&
    (instrumentMax === undefined || maxReached);

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
      createWeighingRow(nextId ? nextId() : undefined),
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
      <div className="mb-4 rounded-md border border-[#D9E2EC] bg-[#F9FBFC] p-3 text-[0.76rem] text-[#344054]">
        <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
          <span>
            OIML R 76-1 Procedure Requirements ({isTypeEval ? 'Type Evaluation: ≥ 10 test loads' : 'Verification: ≥ 5 test loads'}):
          </span>
          <span
            className={`rounded px-2 py-0.5 text-[0.7rem] font-bold ${
              isComplete
                ? 'bg-[#A7F3D0] text-[#065F46]'
                : 'bg-[#FDE68A] text-[#78350F]'
            }`}
          >
            {distinctLoads} of {requiredMinLoads} distinct loads ({rows.length} {rows.length === 1 ? 'observation' : 'observations'}) · {isComplete ? 'COMPLETE' : 'INCOMPLETE'}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[0.72rem] sm:grid-cols-3 lg:grid-cols-6">
          <span className={distinctLoads >= requiredMinLoads ? 'text-[#065F46] font-medium' : 'text-[#B45309]'}>
            {distinctLoads >= requiredMinLoads ? '✓' : '✗'} Distinct loads: {distinctLoads}/{requiredMinLoads}
          </span>
          <span className="text-[#344054]">
            Observation rows: {rows.length} ({validRows.length} valid)
          </span>
          <span className={hasIncreasing && increasingOrdered ? 'text-[#065F46] font-medium' : 'text-[#B45309]'}>
            {hasIncreasing && increasingOrdered ? '✓' : '✗'} Increasing sequence {!hasIncreasing ? '(missing)' : !increasingOrdered ? '(out of order)' : ''}
          </span>
          <span className={hasDecreasing && decreasingOrdered ? 'text-[#065F46] font-medium' : 'text-[#B45309]'}>
            {hasDecreasing && decreasingOrdered ? '✓' : '✗'} Decreasing sequence {!hasDecreasing ? '(missing)' : !decreasingOrdered ? '(out of order)' : ''}
          </span>
          {instrumentMin !== undefined && (
            <span className={minReached ? 'text-[#065F46] font-medium' : 'text-[#B45309]'}>
              {minReached ? '✓' : '✗'} Min load ({instrumentMin} kg)
            </span>
          )}
          {instrumentMax !== undefined && (
            <span className={maxReached ? 'text-[#065F46] font-medium' : 'text-[#B45309]'}>
              {maxReached ? '✓' : '✗'} Max load ({instrumentMax} kg)
            </span>
          )}
        </div>
      </div>

      {rows.length === 0 && (
        <p className="text-[0.75rem] text-[#667085] italic">
          No observations yet — add at least one.
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
                  error={loadError}
                >
                  <TextInput
                    type="number"
                    step="any"
                    value={row.load}
                    hasError={Boolean(loadError)}
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
        );
      })}
      </div>
    </Card>
  );
}
