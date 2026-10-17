import { describe, expect, it } from 'vitest';
import { parseNum } from './types';

describe('parseNum validation helper', () => {
  it('parses valid positive numbers and strings', () => {
    expect(parseNum('10')).toBe(10);
    expect(parseNum('10.5')).toBe(10.5);
    expect(parseNum(10)).toBe(10);
    expect(parseNum(10.5)).toBe(10.5);
  });

  it('accepts zero (0) as a valid numeric value', () => {
    expect(parseNum(0)).toBe(0);
    expect(parseNum('0')).toBe(0);
    expect(parseNum('0.0')).toBe(0);
    expect(parseNum('0.000')).toBe(0);
  });

  it('accepts negative values', () => {
    expect(parseNum(-5)).toBe(-5);
    expect(parseNum('-5')).toBe(-5);
    expect(parseNum('-0.25')).toBe(-0.25);
  });

  it('throws specific field-level error message when string is empty or whitespace', () => {
    expect(() => parseNum('', 'Weighing test load (row 1)')).toThrow(
      'Weighing test load (row 1) is required.'
    );
    expect(() => parseNum('   ', 'Repeatability test load')).toThrow(
      'Repeatability test load is required.'
    );
  });

  it('throws default required message when fieldName is not provided for empty input', () => {
    expect(() => parseNum('')).toThrow('Required numeric value is missing.');
    expect(() => parseNum('  ')).toThrow('Required numeric value is missing.');
  });

  it('throws specific field-level error message when input is undefined or null', () => {
    expect(() => parseNum(undefined, 'Eccentric indicated value (position-1)')).toThrow(
      'Eccentric indicated value (position-1) is required.'
    );
    expect(() => parseNum(null, 'Zero-setting test load')).toThrow(
      'Zero-setting test load is required.'
    );
  });

  it('throws error for invalid non-numeric strings with field name', () => {
    expect(() => parseNum('abc', 'Discrimination test load (row 1)')).toThrow(
      'Discrimination test load (row 1) must be a valid number: "abc".'
    );
  });

  it('throws error for NaN and Infinity values', () => {
    expect(() => parseNum(NaN, 'Indicated value')).toThrow(
      'Indicated value must be a valid number: "NaN".'
    );
    expect(() => parseNum(Infinity, 'Indicated value')).toThrow(
      'Indicated value must be a valid number: "Infinity".'
    );
  });
});
