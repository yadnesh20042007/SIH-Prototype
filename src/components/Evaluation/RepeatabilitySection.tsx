'use client';

import { useEffect } from 'react';
import type { AccuracyClass, VerificationContext } from '@/lib/r76/types';

import {
  Card,
  Field,
  TextInput,
  Checkbox,
} from '@/components/ui/FormField';
import { ComplianceIcon } from '@/components/ui/ComplianceIcon';

import {
  requiredRepeatabilityWeighingsCount,
  resizeIndications,
  isTypeEvaluationContext,
  type RepeatabilityFormState,
  type RepeatabilitySeriesFormState,
} from './types';

interface RepeatabilitySectionProps {
  value: RepeatabilityFormState;
  onChange: (next: RepeatabilityFormState) => void;
  accuracyClass: AccuracyClass;
  instrumentHasAutoZero: boolean;
  verificationContext?: string | VerificationContext;
  instrumentMax?: number;
}

export function RepeatabilitySection({
  value,
  onChange,
  accuracyClass,
  instrumentHasAutoZero,
  verificationContext,
  instrumentMax,
}: RepeatabilitySectionProps) {
  const isTypeEval = isTypeEvaluationContext(verificationContext);
  const required = requiredRepeatabilityWeighingsCount(
    accuracyClass,
    verificationContext,
    instrumentMax
  );

  // Initialize or resize series when in Type Evaluation
  useEffect(() => {
    if (isTypeEval) {
      const s1Indications = resizeIndications(
        value.series?.[0]?.indications ?? value.indications,
        required
      );
      const s2Indications = resizeIndications(
        value.series?.[1]?.indications ?? [],
        required
      );
      const s1Load = value.series?.[0]?.testLoad ?? value.testLoad ?? '';
      const s2Load = value.series?.[1]?.testLoad ?? '';

      const updatedSeries: RepeatabilitySeriesFormState[] = [
        {
          seriesNumber: 1,
          testLoad: s1Load,
          indications: s1Indications,
        },
        {
          seriesNumber: 2,
          testLoad: s2Load,
          indications: s2Indications,
        },
      ];

      if (
        !value.series ||
        value.series.length !== 2 ||
        value.series[0].indications.length !== required ||
        value.series[1].indications.length !== required
      ) {
        onChange({
          ...value,
          testLoad: s1Load,
          indications: s1Indications,
          series: updatedSeries,
        });
      }
    } else {
      if (value.indications.length !== required) {
        onChange({
          ...value,
          indications: resizeIndications(value.indications, required),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [required, isTypeEval]);

  function setSeriesLoad(seriesIdx: number, val: string) {
    if (!value.series) return;
    const nextSeries = [...value.series];
    nextSeries[seriesIdx] = { ...nextSeries[seriesIdx], testLoad: val };
    onChange({
      ...value,
      testLoad: seriesIdx === 0 ? val : value.testLoad,
      series: nextSeries,
    });
  }

  function setSeriesIndication(seriesIdx: number, indicationIdx: number, val: string) {
    if (!value.series) return;
    const nextSeries = [...value.series];
    const nextIndications = [...nextSeries[seriesIdx].indications];
    nextIndications[indicationIdx] = val;
    nextSeries[seriesIdx] = { ...nextSeries[seriesIdx], indications: nextIndications };
    onChange({
      ...value,
      indications: seriesIdx === 0 ? nextIndications : value.indications,
      series: nextSeries,
    });
  }

  function setSingleIndication(index: number, val: string) {
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
      subtitle={
        isTypeEval
          ? `OIML R 76-1 Annex A.4.10: 2 series required (~0.5 Max and close to Max), ${required} weighings each.`
          : `OIML R 76-1 Annex A.4.10: 1 series required (~0.8 Max), ${required} weighings for Accuracy Class ${accuracyClass}.`
      }
    >
      <div className="mb-4 rounded-md border border-[#D9E2EC] bg-[#F9FBFC] p-3.5">
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
              ? 'Instrument is marked as equipped with auto-zero / zero-tracking (must remain active per A.4.10).'
              : 'Instrument is not marked as equipped with auto-zero / zero-tracking.'
          }
        />
      </div>

      {isTypeEval && value.series && value.series.length === 2 ? (
        <div className="flex flex-col gap-6">
          {value.series.map((s, seriesIdx) => (
            <div
              key={s.seriesNumber}
              className="rounded-md border border-[#D9E2EC] bg-[#F9FBFC] p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[#004182]">
                  Series {s.seriesNumber} ·{' '}
                  {s.seriesNumber === 1
                    ? `Load ~0.5 Max (${instrumentMax ? `${Math.round(instrumentMax * 0.5 * 100) / 100} kg` : '~50%'})`
                    : `Load Close to Max (${instrumentMax ? `${instrumentMax} kg` : '~100%'})`}
                </span>
                <span className="rounded bg-[#E0E7FF] px-2 py-0.5 text-[0.68rem] font-bold text-[#3730A3]">
                  {required} weighings
                </span>
              </div>

              <div className="mb-3">
                <Field
                  label={`Series ${s.seriesNumber} Test Load (kg)`}
                  hint={
                    s.seriesNumber === 1
                      ? 'Apply a test load of approximately 0.5 Max (A.4.10)'
                      : 'Apply a test load close to Max (A.4.10)'
                  }
                >
                  <TextInput
                    type="number"
                    step="any"
                    value={s.testLoad}
                    onChange={(v) => setSeriesLoad(seriesIdx, v)}
                    placeholder={
                      s.seriesNumber === 1 && instrumentMax
                        ? String(Math.round(instrumentMax * 0.5 * 100) / 100)
                        : s.seriesNumber === 2 && instrumentMax
                        ? String(instrumentMax)
                        : 'e.g. 24'
                    }
                  />
                </Field>
              </div>

              <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#667085]">
                Repeated Indications (kg)
              </span>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
                {s.indications.map((ind, indIdx) => (
                  <Field key={indIdx} label={`#${indIdx + 1}`}>
                    <TextInput
                      type="number"
                      step="any"
                      value={ind}
                      onChange={(v) => setSeriesIndication(seriesIdx, indIdx, v)}
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 rounded-md border border-[#D9E2EC] bg-[#F9FBFC] p-3.5 sm:grid-cols-2">
            <Field
              label="Test Load (kg)"
              hint={
                instrumentMax
                  ? `Recommended: approximately 0.8 × Max (${Math.round(instrumentMax * 0.8 * 100) / 100} kg per A.4.10)`
                  : 'Test load for repeatability series (A.4.10)'
              }
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
          </div>

          <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#004182]">
            Repeated Indications (kg)
          </span>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {value.indications.map((indication, index) => (
              <Field key={index} label={`#${index + 1}`}>
                <TextInput
                  type="number"
                  step="any"
                  value={indication}
                  onChange={(v) => setSingleIndication(index, v)}
                />
              </Field>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
