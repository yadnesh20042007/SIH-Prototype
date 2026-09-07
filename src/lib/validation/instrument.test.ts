import { describe, expect, it } from 'vitest';

import { validateInstrumentCreate, validateInstrumentUpdate } from './instrument';

const validCreate = {
  manufacturerId: 'cm1234567890manufacturer',
  model: 'Precision 1000',
  accuracyClass: 'III',
  instrumentType: 'SINGLE_RANGE',
  max: '1000.000000',
  min: '0.020000',
  e: '0.01000000',
  d: '0.00500000',
  numberOfSupportPoints: 4,
};

describe('validateInstrumentCreate', () => {
  it('accepts a valid create payload', () => {
    const result = validateInstrumentCreate(validCreate);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(validCreate);
  });

  it('rejects a missing model', () => {
    const { model: _model, ...payload } = validCreate;
    const result = validateInstrumentCreate(payload);

    expect(result.errors).toContainEqual({ field: 'model', message: 'is required' });
  });

  it('rejects a whitespace-only model', () => {
    const result = validateInstrumentCreate({ ...validCreate, model: '  \t ' });

    expect(result.errors).toContainEqual({ field: 'model', message: 'is required' });
  });

  it.each([0, '-0.01'])('rejects max <= 0 (%s)', (max) => {
    const result = validateInstrumentCreate({ ...validCreate, max });

    expect(result.errors).toContainEqual({ field: 'max', message: 'must be greater than 0' });
  });

  it('rejects min < 0', () => {
    const result = validateInstrumentCreate({ ...validCreate, min: '-0.000001' });

    expect(result.errors).toContainEqual({
      field: 'min',
      message: 'must be greater than or equal to 0',
    });
  });

  it.each([
    ['1000', '1000'],
    ['1000.000001', '1000'],
  ])('rejects min >= max (min %s, max %s)', (min, max) => {
    const result = validateInstrumentCreate({ ...validCreate, min, max });

    expect(result.errors).toContainEqual({ field: 'min', message: 'must be less than max' });
  });

  it('rejects e <= 0', () => {
    const result = validateInstrumentCreate({ ...validCreate, e: '0' });

    expect(result.errors).toContainEqual({ field: 'e', message: 'must be greater than 0' });
  });

  it('rejects d <= 0', () => {
    const result = validateInstrumentCreate({ ...validCreate, d: '-1e-8' });

    expect(result.errors).toContainEqual({ field: 'd', message: 'must be greater than 0' });
  });

  it('rejects an invalid accuracy class', () => {
    const result = validateInstrumentCreate({ ...validCreate, accuracyClass: 'V' });

    expect(result.success).toBe(false);
    expect(result.errors[0]?.field).toBe('accuracyClass');
  });

  it('rejects an invalid instrument type', () => {
    const result = validateInstrumentCreate({ ...validCreate, instrumentType: 'single_range' });

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'instrumentType',
      message: 'must be one of: SINGLE_RANGE, MULTI_RANGE, MULTI_INTERVAL',
    });
  });

  it.each([0, -2, 1.5, 'not-an-integer'])('rejects invalid support-point value %s', (value) => {
    const result = validateInstrumentCreate({ ...validCreate, numberOfSupportPoints: value });

    expect(result.errors).toContainEqual({
      field: 'numberOfSupportPoints',
      message: 'must be a positive integer',
    });
  });

  it('preserves validated decimal strings exactly', () => {
    const result = validateInstrumentCreate({
      ...validCreate,
      max: '  1000.000000  ',
      min: '0.00000000012300',
      e: '1.2300e-7',
      d: '0.000000001000',
      initialZeroSettingRange: '0.200000',
    });

    expect(result.data).toMatchObject({
      max: '1000.000000',
      min: '0.00000000012300',
      e: '1.2300e-7',
      d: '0.000000001000',
      initialZeroSettingRange: '0.200000',
    });
  });

  it('validates optional configuration fields by their Prisma types', () => {
    const result = validateInstrumentCreate({
      ...validCreate,
      serialNumber: null,
      additiveTareEffect: false,
      hasAutoZeroOrTracking: true,
      hasInitialZeroSettingDevice: true,
      hasFineDisplayDevice: false,
    });

    expect(result.success).toBe(true);
    expect(result.data?.serialNumber).toBeNull();
  });
});

describe('validateInstrumentUpdate', () => {
  it('accepts a valid partial update and trims strings', () => {
    const result = validateInstrumentUpdate({ model: '  Precision 2000  ', max: '2000.00' });

    expect(result).toEqual({
      success: true,
      data: { model: 'Precision 2000', max: '2000.00' },
      errors: [],
    });
  });

  it('enforces min < max when both are supplied', () => {
    const result = validateInstrumentUpdate({ min: '10.0000000001', max: '10' });

    expect(result.errors).toContainEqual({ field: 'min', message: 'must be less than max' });
  });
});
