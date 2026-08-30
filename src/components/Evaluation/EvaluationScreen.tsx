'use client';

import { useRef, useState } from 'react';

import {
  InstrumentType,
  VerificationContext,
  type Instrument,
} from '@/lib/r76/types';

import type {
  TestObservations,
  OrchestrationResult,
} from '@/lib/r76/engine';

import { validEvaluationFixture } from '@/app/api/r76/evaluate/fixture';

import { InstrumentSection } from './InstrumentSection';
import { WeighingPerformanceSection } from './WeighingPerformanceSection';
import { RepeatabilitySection } from './RepeatabilitySection';
import { EccentricLoadingSection } from './EccentricLoadingSection';
import { ResultsSection } from './ResultsSection';

import {
  createDefaultInstrument,
  createDefaultRepeatability,
  createWeighingRow,
  createEccentricRow,
  parseNum,
  type InstrumentFormState,
  type WeighingRowState,
  type RepeatabilityFormState,
  type EccentricRowState,
} from './types';

export function EvaluationScreen() {
  const idCounter = useRef(0);

  const nextId = () => String(idCounter.current++);

  const [instrument, setInstrument] =
    useState<InstrumentFormState>(
      createDefaultInstrument()
    );

  const [
    verificationContext,
    setVerificationContext,
  ] = useState<VerificationContext>(
    VerificationContext.InitialVerification
  );

  const [weighingRows, setWeighingRows] =
    useState<WeighingRowState[]>([
      createWeighingRow('w-0'),
    ]);

  const [repeatability, setRepeatability] =
    useState<RepeatabilityFormState>(
      createDefaultRepeatability()
    );

  const [eccentricRows, setEccentricRows] =
    useState<EccentricRowState[]>([
      createEccentricRow(
        'e-0',
        'position-1'
      ),
    ]);

  const [
    eccentricZeroDetermined,
    setEccentricZeroDetermined,
  ] = useState(false);

  const [result, setResult] =
    useState<OrchestrationResult | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  function loadDemoData() {
    const fixture = validEvaluationFixture;

    setInstrument({
      id: fixture.instrument.id,
      manufacturer:
        fixture.instrument.manufacturer,
      model: fixture.instrument.model,
      serialNumber:
        fixture.instrument.serialNumber ?? '',
      accuracyClass:
        fixture.instrument.accuracyClass,

      max: String(fixture.instrument.max),
      min: String(fixture.instrument.min),
      e: String(fixture.instrument.e),
      d: String(fixture.instrument.d),

      numberOfSupportPoints: String(
        fixture.instrument.numberOfSupportPoints
      ),

      additiveTareEffect:
        fixture.instrument.additiveTareEffect,

      hasAutoZeroOrTracking:
        fixture.instrument
          .hasAutoZeroOrTracking,

      hasInitialZeroSettingDevice:
        fixture.instrument
          .hasInitialZeroSettingDevice,

      initialZeroSettingRange: String(
        fixture.instrument
          .initialZeroSettingRange
      ),

      hasFineDisplayDevice:
        fixture.instrument
          .hasFineDisplayDevice,
    });

    setVerificationContext(
      fixture.verificationContext
    );

    setWeighingRows(
      (
        fixture.observations
          .weighingPerformance ?? []
      ).map((observation, index) => ({
        id: `w-demo-${index}`,

        load: String(
          observation.load
        ),

        indicatedValue: String(
          observation.indicatedValue
        ),

        additionalLoad: String(
          observation.additionalLoad ?? 0
        ),

        zeroError: String(
          observation.zeroError
        ),

        loadingDirection:
          observation.loadingDirection,
      }))
    );

    if (
      fixture.observations.repeatability
    ) {
      setRepeatability({
        testLoad: String(
          fixture.observations
            .repeatability.testLoad
        ),

        indications:
          fixture.observations
            .repeatability.indications
            .map(String),

        autoZeroOrTrackingActive:
          fixture.observations
            .repeatability
            .autoZeroOrTrackingActive,
      });
    }

    setEccentricRows(
      (
        fixture.observations
          .eccentricLoading ?? []
      ).map((observation, index) => ({
        id: `e-demo-${index}`,

        positionId:
          observation.positionId,

        appliedLoad: String(
          observation.appliedLoad
        ),

        indicatedValue: String(
          observation.indicatedValue
        ),

        additionalLoad: String(
          observation.additionalLoad ?? 0
        ),

        zeroError: String(
          observation.zeroError
        ),

        autoZeroOrTrackingDisabled:
          observation
            .autoZeroOrTrackingDisabled,
      }))
    );

    setEccentricZeroDetermined(
      fixture.observations
        .eccentricZeroDeterminedBeforeEachLoading ??
        false
    );

    setResult(null);
    setError(null);
  }

  async function evaluateCompliance() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const supportPoints = parseNum(
        instrument.numberOfSupportPoints
      );

      if (
        !Number.isInteger(supportPoints) ||
        supportPoints <= 0
      ) {
        throw new Error(
          'Number of support points must be a positive whole number.'
        );
      }

      const instrumentPayload: Instrument = {
        id: instrument.id,

        manufacturer:
          instrument.manufacturer.trim(),

        model:
          instrument.model.trim(),

        serialNumber:
          instrument.serialNumber.trim() ||
          undefined,

        accuracyClass:
          instrument.accuracyClass,

        max: parseNum(
          instrument.max
        ),

        min: parseNum(
          instrument.min
        ),

        e: parseNum(
          instrument.e
        ),

        d: parseNum(
          instrument.d
        ),

        numberOfSupportPoints:
          supportPoints,

        additiveTareEffect:
          instrument.additiveTareEffect,

        hasAutoZeroOrTracking:
          instrument.hasAutoZeroOrTracking,

        hasInitialZeroSettingDevice:
          instrument
            .hasInitialZeroSettingDevice,

        initialZeroSettingRange:
          parseNum(
            instrument
              .initialZeroSettingRange
          ),

        hasFineDisplayDevice:
          instrument.hasFineDisplayDevice,

        instrumentType:
          InstrumentType.SingleRange,
      };

      const observationsPayload: TestObservations =
        {
          weighingPerformance:
            weighingRows.map(
              (row, index) => ({
                sequenceIndex: index,

                load:
                  parseNum(
                    row.load
                  ),

                indicatedValue:
                  parseNum(
                    row.indicatedValue
                  ),

                additionalLoad:
                  parseNum(
                    row.additionalLoad
                  ),

                zeroError:
                  parseNum(
                    row.zeroError
                  ),

                loadingDirection:
                  row.loadingDirection,
              })
            ),

          repeatability: {
            testLoad:
              parseNum(
                repeatability.testLoad
              ),

            indications:
              repeatability.indications.map(
                (indication) =>
                  parseNum(indication)
              ),

            autoZeroOrTrackingActive:
              repeatability
                .autoZeroOrTrackingActive,
          },

          eccentricLoading:
            eccentricRows.map(
              (row) => ({
                positionId:
                  row.positionId.trim(),

                appliedLoad:
                  parseNum(
                    row.appliedLoad
                  ),

                indicatedValue:
                  parseNum(
                    row.indicatedValue
                  ),

                additionalLoad:
                  parseNum(
                    row.additionalLoad
                  ),

                zeroError:
                  parseNum(
                    row.zeroError
                  ),

                autoZeroOrTrackingDisabled:
                  row
                    .autoZeroOrTrackingDisabled,
              })
            ),

          eccentricZeroDeterminedBeforeEachLoading:
            eccentricZeroDetermined,
        };

      const response = await fetch(
        '/api/r76/evaluate',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            instrument:
              instrumentPayload,

            verificationContext,

            observations:
              observationsPayload,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data?.error === 'string'
            ? data.error
            : `Request failed with status ${response.status}.`
        );

        return;
      }

      setResult(
        data as OrchestrationResult
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to evaluate the supplied data.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(430px,0.82fr)]">
      {/* Input workflow */}
      <div className="flex flex-col gap-4">
        <InstrumentSection
          value={instrument}
          onChange={setInstrument}
          verificationContext={
            verificationContext
          }
          onVerificationContextChange={
            setVerificationContext
          }
        />

        <WeighingPerformanceSection
          rows={weighingRows}
          onChange={setWeighingRows}
          nextId={() =>
            `w-${nextId()}`
          }
        />

        <RepeatabilitySection
          value={repeatability}
          onChange={setRepeatability}
          accuracyClass={
            instrument.accuracyClass
          }
          instrumentHasAutoZero={
            instrument
              .hasAutoZeroOrTracking
          }
        />

        <EccentricLoadingSection
          rows={eccentricRows}
          onChange={setEccentricRows}
          zeroDeterminedBeforeEachLoading={
            eccentricZeroDetermined
          }
          onZeroDeterminedChange={
            setEccentricZeroDetermined
          }
          instrumentHasAutoZero={
            instrument
              .hasAutoZeroOrTracking
          }
          nextId={() =>
            `e-${nextId()}`
          }
        />

        <div className="flex flex-col-reverse gap-3 border-t border-[#D9E2EC] pt-1 sm:flex-row sm:justify-end sm:border-0 sm:pt-0">
          <button
            type="button"
            onClick={
              evaluateCompliance
            }
            disabled={loading}
            className="min-w-[230px] rounded-[5px] bg-[#0A66C2] px-6 py-3 text-[0.82rem] font-bold text-white shadow-[0_1px_2px_rgba(16,24,40,0.12)] transition-colors hover:bg-[#004182] disabled:cursor-not-allowed disabled:bg-[#98A2B3]"
          >
            {loading
              ? 'Evaluating…'
              : 'Evaluate Compliance'}
          </button>

          <button
            type="button"
            onClick={loadDemoData}
            disabled={loading}
            className="rounded-[5px] border border-[#AEBECD] bg-white px-6 py-3 text-[0.78rem] font-semibold text-[#344054] transition-colors hover:border-[#0A66C2] hover:bg-[#F6FAFE] hover:text-[#0A66C2] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load Demo Data
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="xl:sticky xl:top-5">
        <ResultsSection
          result={result}
          error={error}
          loading={loading}
        />
      </div>
    </div>
  );
}
