import { describe, expect, it } from 'vitest';
import { selectTests } from '@/lib/r76/test-selection';
import { TestType } from '@/lib/r76/types/test';
import {
  AccuracyClass,
  IndicationType,
  InstrumentType,
  ZeroSettingMechanism,
  type Instrument,
} from '@/lib/r76/types/instrument';
import { VerificationContext } from '@/lib/r76/types/verification';
import { evaluateInstrumentCompliance } from '@/lib/r76/engine';
import type { ZeroSettingAccuracyTestResult } from '@/lib/r76/calculations/zero-setting';
import { canonicalJson } from '@/lib/db/observation-fingerprint';

describe('Zero-Setting Accuracy Regression & End-to-End Flow Tests', () => {
  const baseUiConfiguration = {
    verificationContext: VerificationContext.TypeEvaluation,
    hasInitialZeroSettingDevice: true,
    initialZeroSettingRange: '0.04',
    zeroSettingMechanisms: ['SEMI_AUTOMATIC'],
    indicationType: 'DIGITAL',
    e: '0.01',
    d: '0.005',
    max: '30',
    min: '0.2',
    model: 'TestModel-100',
    serialNumber: 'SN-ZERO-01',
    numberOfSupportPoints: '4',
    additiveTareEffect: false,
    hasAutoZeroOrTracking: true,
    hasFineDisplayDevice: false,
  };

  it('selectTests: marks Zero-Setting Accuracy applicable when semi-automatic zero-setting is configured', () => {
    // Exact mapping that EvaluationScreen now uses in testSelection useMemo
    const instrumentObj: Instrument = {
      id: 'inst-1',
      manufacturer: 'Avery',
      model: baseUiConfiguration.model,
      serialNumber: baseUiConfiguration.serialNumber,
      accuracyClass: AccuracyClass.III,
      max: Number(baseUiConfiguration.max),
      min: Number(baseUiConfiguration.min),
      e: Number(baseUiConfiguration.e),
      d: Number(baseUiConfiguration.d),
      numberOfSupportPoints: Number(baseUiConfiguration.numberOfSupportPoints),
      additiveTareEffect: baseUiConfiguration.additiveTareEffect,
      hasAutoZeroOrTracking: baseUiConfiguration.hasAutoZeroOrTracking,
      hasInitialZeroSettingDevice: baseUiConfiguration.hasInitialZeroSettingDevice,
      initialZeroSettingRange: Number(baseUiConfiguration.initialZeroSettingRange),
      hasFineDisplayDevice: baseUiConfiguration.hasFineDisplayDevice,
      instrumentType: InstrumentType.SingleRange,
      indicationType: IndicationType.Digital,
      zeroSettingMechanisms: baseUiConfiguration.zeroSettingMechanisms.map(m => m.toLowerCase()) as any[],
    };

    const selections = selectTests(instrumentObj, baseUiConfiguration.verificationContext);
    const zeroSettingSelection = selections.find(s => s.testType === TestType.ZeroSettingAccuracy);

    expect(zeroSettingSelection).toBeDefined();
    expect(zeroSettingSelection?.isApplicable).toBe(true);
    expect(zeroSettingSelection?.r76Reference).toBe('OIML R76-1 clause 4.5.2, A.4.2.3');
  });

  it('selectTests: reproduces root cause when zeroSettingMechanisms was omitted', () => {
    // When zeroSettingMechanisms is omitted (undefined), it was treated as not applicable
    const instrumentObjWithoutZeroMechanisms: Instrument = {
      id: 'inst-1',
      manufacturer: 'Avery',
      model: baseUiConfiguration.model,
      serialNumber: baseUiConfiguration.serialNumber,
      accuracyClass: AccuracyClass.III,
      max: Number(baseUiConfiguration.max),
      min: Number(baseUiConfiguration.min),
      e: Number(baseUiConfiguration.e),
      d: Number(baseUiConfiguration.d),
      numberOfSupportPoints: 4,
      additiveTareEffect: false,
      hasAutoZeroOrTracking: true,
      hasInitialZeroSettingDevice: true,
      initialZeroSettingRange: 0.04,
      hasFineDisplayDevice: false,
      instrumentType: InstrumentType.SingleRange,
      indicationType: IndicationType.Digital,
      // zeroSettingMechanisms was missing here previously!
    };

    const selections = selectTests(instrumentObjWithoutZeroMechanisms, baseUiConfiguration.verificationContext);
    const zeroSettingSelection = selections.find(s => s.testType === TestType.ZeroSettingAccuracy);

    expect(zeroSettingSelection?.isApplicable).toBe(false);
    expect(zeroSettingSelection?.reason).toContain('Unsupported: Zero-setting mechanism metadata is missing or unrecorded');
  });

  it('save and reload: verifies complete instrument and observation persistence and rehydration', () => {
    // 1. UI form state
    const formState = {
      ...baseUiConfiguration,
    };

    // 2. Save Progress payload construction (simulating saveProgress)
    const instrumentPatchPayload = {
      model: formState.model.trim(),
      serialNumber: formState.serialNumber.trim() || null,
      accuracyClass: AccuracyClass.III,
      max: formState.max,
      min: formState.min,
      e: formState.e,
      d: formState.d,
      zeroSettingMechanisms: formState.zeroSettingMechanisms,
      indicationType: formState.indicationType || null,
      numberOfSupportPoints: Number(formState.numberOfSupportPoints),
      additiveTareEffect: formState.additiveTareEffect,
      hasAutoZeroOrTracking: formState.hasAutoZeroOrTracking,
      hasInitialZeroSettingDevice: formState.hasInitialZeroSettingDevice,
      initialZeroSettingRange: formState.initialZeroSettingRange || '0',
      hasFineDisplayDevice: formState.hasFineDisplayDevice,
    };

    expect(instrumentPatchPayload.zeroSettingMechanisms).toEqual(['SEMI_AUTOMATIC']);
    expect(instrumentPatchPayload.e).toBe('0.01');
    expect(instrumentPatchPayload.d).toBe('0.005');

    // 3. Simulated DB state returned on reload (GET /api/instruments/[id])
    const dbInstrumentRecord = {
      id: 'inst-1',
      manufacturer: { name: 'Avery' },
      ...instrumentPatchPayload,
      zeroSettingMechanisms: ['SEMI_AUTOMATIC'],
    };

    // 4. Simulated loaded workspace state (loadWorkspace)
    const rehydratedInstrument = {
      id: dbInstrumentRecord.id,
      manufacturer: dbInstrumentRecord.manufacturer.name,
      model: dbInstrumentRecord.model,
      serialNumber: dbInstrumentRecord.serialNumber ?? '',
      accuracyClass: dbInstrumentRecord.accuracyClass,
      instrumentType: 'SINGLE_RANGE',
      indicationType: dbInstrumentRecord.indicationType ?? undefined,
      max: dbInstrumentRecord.max,
      min: dbInstrumentRecord.min,
      e: dbInstrumentRecord.e,
      d: dbInstrumentRecord.d,
      numberOfSupportPoints: String(dbInstrumentRecord.numberOfSupportPoints),
      additiveTareEffect: dbInstrumentRecord.additiveTareEffect,
      hasAutoZeroOrTracking: dbInstrumentRecord.hasAutoZeroOrTracking,
      hasInitialZeroSettingDevice: dbInstrumentRecord.hasInitialZeroSettingDevice,
      initialZeroSettingRange: dbInstrumentRecord.initialZeroSettingRange,
      hasFineDisplayDevice: dbInstrumentRecord.hasFineDisplayDevice,
      zeroSettingMechanisms: dbInstrumentRecord.zeroSettingMechanisms ?? [],
    };

    expect(rehydratedInstrument.zeroSettingMechanisms).toEqual(['SEMI_AUTOMATIC']);

    // 5. Test selection derived from rehydrated state
    const derivedInstrumentObj: Instrument = {
      id: rehydratedInstrument.id,
      manufacturer: rehydratedInstrument.manufacturer,
      model: rehydratedInstrument.model,
      serialNumber: rehydratedInstrument.serialNumber || undefined,
      accuracyClass: rehydratedInstrument.accuracyClass as AccuracyClass,
      max: Number(rehydratedInstrument.max),
      min: Number(rehydratedInstrument.min),
      e: Number(rehydratedInstrument.e),
      d: Number(rehydratedInstrument.d),
      numberOfSupportPoints: Number(rehydratedInstrument.numberOfSupportPoints),
      additiveTareEffect: rehydratedInstrument.additiveTareEffect,
      hasAutoZeroOrTracking: rehydratedInstrument.hasAutoZeroOrTracking,
      hasInitialZeroSettingDevice: rehydratedInstrument.hasInitialZeroSettingDevice,
      initialZeroSettingRange: Number(rehydratedInstrument.initialZeroSettingRange),
      hasFineDisplayDevice: rehydratedInstrument.hasFineDisplayDevice,
      instrumentType: InstrumentType.SingleRange,
      indicationType: IndicationType.Digital,
      zeroSettingMechanisms: (rehydratedInstrument.zeroSettingMechanisms.map(m => m.toLowerCase()) as any[]).sort(),
    };

    const selections = selectTests(derivedInstrumentObj, baseUiConfiguration.verificationContext);
    const applicableTestTypes = new Set(selections.filter(s => s.isApplicable).map(s => s.testType));

    // Ensures Zero-Setting Accuracy observation section appears in the UI
    expect(applicableTestTypes.has(TestType.ZeroSettingAccuracy)).toBe(true);
  });

  it('successful evaluation: client snapshot and server snapshot match canonically, and evaluation passes', () => {
    // Client snapshot
    const clientInstrument: Instrument = {
      id: 'inst-1',
      manufacturer: 'Avery',
      model: 'TestModel-100',
      serialNumber: 'SN-ZERO-01',
      accuracyClass: AccuracyClass.III,
      max: 30,
      min: 0.2,
      e: 0.01,
      d: 0.005,
      numberOfSupportPoints: 4,
      additiveTareEffect: false,
      hasAutoZeroOrTracking: true,
      hasInitialZeroSettingDevice: true,
      initialZeroSettingRange: 0.04,
      hasFineDisplayDevice: false,
      instrumentType: InstrumentType.SingleRange,
      indicationType: IndicationType.Digital,
      zeroSettingMechanisms: [ZeroSettingMechanism.SemiAutomatic],
    };

    // Server-reconstructed snapshot (from DB instrument)
    const serverInstrument: Instrument = {
      id: 'inst-1',
      manufacturer: 'Avery',
      model: 'TestModel-100',
      serialNumber: 'SN-ZERO-01',
      accuracyClass: AccuracyClass.III,
      max: 30,
      min: 0.2,
      e: 0.01,
      d: 0.005,
      numberOfSupportPoints: 4,
      additiveTareEffect: false,
      hasAutoZeroOrTracking: true,
      hasInitialZeroSettingDevice: true,
      initialZeroSettingRange: 0.04,
      hasFineDisplayDevice: false,
      instrumentType: InstrumentType.SingleRange,
      indicationType: IndicationType.Digital,
      zeroSettingMechanisms: [ZeroSettingMechanism.SemiAutomatic],
    };

    // Both canonical JSON representations must match exactly (preserving stale-data check)
    expect(canonicalJson(JSON.parse(JSON.stringify(clientInstrument))))
      .toBe(canonicalJson(JSON.parse(JSON.stringify(serverInstrument))));

    const typeLoads = [0.2, 1, 2, 5, 10, 15, 20, 25, 28, 30];
    const weighingPerformance = [
      ...typeLoads.map((load, idx) => ({
        sequenceIndex: idx,
        load,
        indicatedValue: load,
        additionalLoad: 0.005,
        zeroError: 0,
        loadingDirection: 'increasing' as const,
      })),
      ...[...typeLoads].reverse().map((load, idx) => ({
        sequenceIndex: typeLoads.length + idx,
        load,
        indicatedValue: load,
        additionalLoad: 0.005,
        zeroError: 0,
        loadingDirection: 'decreasing' as const,
      })),
    ];

    const observations = {
      weighingPerformance,
      repeatability: {
        series: [
          { seriesNumber: 1, testLoad: 15, indications: Array(10).fill(15) },
          { seriesNumber: 2, testLoad: 30, indications: Array(10).fill(30) },
        ],
        autoZeroOrTrackingActive: true,
      },
      eccentricLoading: [1, 2, 3, 4].map(pos => ({
        positionId: String(pos),
        appliedLoad: 10,
        indicatedValue: 10,
        additionalLoad: 0.005,
        zeroError: 0,
        autoZeroOrTrackingDisabled: true,
      })),
      eccentricZeroDeterminedBeforeEachLoading: false,
      discrimination: [
        { testLoad: 0.2, indicationBefore: 0.2, indicationAfter: 0.205 },
        { testLoad: 15, indicationBefore: 15, indicationAfter: 15.005 },
        { testLoad: 30, indicationBefore: 30, indicationAfter: 30.005 },
      ],
      zeroSettingAccuracy: {
        load: 0.1,
        indicatedValue: 0.1,
        additionalLoad: 0.005,
      },
    };

    const evaluation = evaluateInstrumentCompliance(
      clientInstrument,
      VerificationContext.TypeEvaluation,
      observations
    );

    expect(evaluation.overallOutcome).toBe('pass');
    const zeroResult = evaluation.evaluatedTests.find(t => t.testType === TestType.ZeroSettingAccuracy);
    expect(zeroResult).toBeDefined();
    expect(zeroResult?.status).toBe('passed');
    expect(zeroResult?.result?.outcome).toBe('pass');
    const zeroAccuracyResult = zeroResult?.result as ZeroSettingAccuracyTestResult | undefined;
    expect(zeroAccuracyResult?.traces).toHaveLength(1);
  });
});
