/**
 * R76 Test-Selection module.
 *
 * Exports the automatic test-selection engine that determines which
 * OIML R76 tests apply to a given instrument based on its stored
 * configuration (instrument type, number of support points, auto-zero
 * presence, and initial zero-setting range).
 *
 * Supported scope (this prototype):
 *  - Single-range instruments only
 *  - ≤ 4 load-receptor support points for eccentric loading
 *  - All accuracy classes (I, II, III, IIII) — class does not gate test
 *    applicability for the three currently supported tests
 *
 * @module lib/r76/test-selection
 */

export { selectTests } from './engine';
export type { TestSelectionResult } from './engine';
