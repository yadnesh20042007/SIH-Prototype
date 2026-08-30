import { describe, it, expect } from 'vitest';
import { selectTests } from './engine';
import { AccuracyClass, Instrument, InstrumentType } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { TestType } from '../types/test';

describe('Test Selection Engine (OIML R76 Applicability)', () => {
  const baseStandardInst: Instrument = {
    id: 'inst-standard',
    manufacturer: 'TestMaker',
    model: 'TestModel',
    accuracyClass: AccuracyClass.III,
    max: 15000,
    min: 100,
    e: 5,
    d: 5,
    numberOfSupportPoints: 4,
    additiveTareEffect: false,
    hasAutoZeroOrTracking: true,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: 0,
    hasFineDisplayDevice: false,
    instrumentType: InstrumentType.SingleRange
  };

  const context = VerificationContext.InitialVerification;

  it('selects all currently applicable supported tests for a standard Class III single-range instrument', () => {
    const results = selectTests(baseStandardInst, context);
    
    expect(results).toHaveLength(3);
    
    const weighing = results.find(r => r.testType === TestType.WeighingPerformance);
    expect(weighing?.isApplicable).toBe(true);
    expect(weighing?.r76Reference).toContain('A.4.4.1');
    expect(weighing?.prerequisites).toContain('Pre-load the instrument once to Max (or Lim) before the test (A.4.1.10).');

    const repeatability = results.find(r => r.testType === TestType.Repeatability);
    expect(repeatability?.isApplicable).toBe(true);
    expect(repeatability?.r76Reference).toContain('3.6.1');
    expect(repeatability?.prerequisites).toContain('Automatic zero-setting or zero-tracking shall be in operation during this test (A.4.10).');

    const eccentric = results.find(r => r.testType === TestType.EccentricLoading);
    expect(eccentric?.isApplicable).toBe(true);
    expect(eccentric?.r76Reference).toContain('A.4.7.1');
    expect(eccentric?.prerequisites.some(p => p.includes('must NOT be in operation'))).toBe(true);
  });

  it('provides correct explanatory references for selected tests', () => {
    const results = selectTests(baseStandardInst, context);
    
    results.forEach(res => {
      expect(typeof res.reason).toBe('string');
      expect(res.reason.length).toBeGreaterThan(0);
      expect(typeof res.r76Reference).toBe('string');
      expect(res.r76Reference).toContain('OIML R76-1');
    });
  });

  it('explicitly rejects eccentric-loading for instruments with more than 4 support points', () => {
    const moreThan4PointsInst = { ...baseStandardInst, numberOfSupportPoints: 6 };
    const results = selectTests(moreThan4PointsInst, context);
    
    const eccentric = results.find(r => r.testType === TestType.EccentricLoading);
    expect(eccentric?.isApplicable).toBe(false);
    expect(eccentric?.reason).toContain('Unsupported');
    expect(eccentric?.reason).toContain('> 4 support points');
    expect(eccentric?.r76Reference).toContain('A.4.7.2');
  });

  it('explicitly reports unsupported configuration (e.g. multi-interval cast simulation)', () => {
    // Simulating a future unsupported type being passed in
    const unsupportedInst = { ...baseStandardInst, instrumentType: 'multi_interval' as InstrumentType };
    const results = selectTests(unsupportedInst, context);
    
    expect(results).toHaveLength(3);
    results.forEach(res => {
      expect(res.isApplicable).toBe(false);
      expect(res.reason).toContain('Unsupported');
      expect(res.reason).toContain('Only single-range instruments are currently supported');
    });
  });

  it('identifies supplementary weighing test requirement when initial zero-setting > 20% Max', () => {
    const reqInst = { ...baseStandardInst, hasInitialZeroSettingDevice: true, initialZeroSettingRange: 0.25 };
    const results = selectTests(reqInst, context);
    
    const weighing = results.find(r => r.testType === TestType.WeighingPerformance);
    expect(weighing?.isApplicable).toBe(true);
    expect(weighing?.prerequisites.some(p => p.includes('Supplementary weighing test required'))).toBe(true);
  });

  it('produces deterministic output for identical instrument inputs', () => {
    const run1 = selectTests(baseStandardInst, context);
    const run2 = selectTests(baseStandardInst, context);
    
    expect(run1).toEqual(run2);
  });
});
