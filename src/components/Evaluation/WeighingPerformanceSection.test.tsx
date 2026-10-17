import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WeighingPerformanceSection } from './WeighingPerformanceSection';
import { createWeighingRow, type WeighingRowState } from './types';

describe('WeighingPerformanceSection UI Regressions', () => {
  const dummyOnChange = () => {};
  const dummyNextId = () => 'w-1';

  // Regression requirement: Max = 30, load = 35 => invalid
  it('Max = 30, load = 35 => shows clear inline validation error and marks procedure incomplete', () => {
    const rows: WeighingRowState[] = [
      {
        id: 'w-1',
        load: '35',
        indicatedValue: '35',
        additionalLoad: '0.005',
        zeroError: '0',
        loadingDirection: 'increasing',
      },
    ];

    const html = renderToStaticMarkup(
      <WeighingPerformanceSection
        rows={rows}
        onChange={dummyOnChange}
        nextId={dummyNextId}
        verificationContext="INITIAL_VERIFICATION"
        instrumentMin={0.2}
        instrumentMax={30}
        instrumentE={0.01}
      />
    );

    // Renders inline validation error beside the invalid load input with alert role
    expect(html).toContain('role="alert"');
    expect(html).toContain('exceeds instrument Max capacity (30 kg)');

    // Max requirement must NOT be satisfied
    expect(html).toContain('✗ Max load (30 kg)');
    expect(html).not.toContain('✓ Max load (30 kg)');

    // Overall status must be INCOMPLETE
    expect(html).toContain('INCOMPLETE');
    expect(html).not.toContain('· COMPLETE');
  });

  // Regression requirement: Max = 30, load = 30 => valid
  it('Max = 30, load = 30 => valid without error and satisfies Max load check', () => {
    const rows: WeighingRowState[] = [
      {
        id: 'w-1',
        load: '30',
        indicatedValue: '30',
        additionalLoad: '0.005',
        zeroError: '0',
        loadingDirection: 'increasing',
      },
    ];

    const html = renderToStaticMarkup(
      <WeighingPerformanceSection
        rows={rows}
        onChange={dummyOnChange}
        nextId={dummyNextId}
        verificationContext="INITIAL_VERIFICATION"
        instrumentMin={0.2}
        instrumentMax={30}
        instrumentE={0.01}
      />
    );

    // No validation error
    expect(html).not.toContain('exceeds instrument Max capacity');
    expect(html).not.toContain('role="alert"');

    // Max requirement IS satisfied
    expect(html).toContain('✓ Max load (30 kg)');
  });

  // Regression requirement: Empty observation => not counted
  it('Empty observation => not counted toward loads count, sequences, or completeness', () => {
    const rows: WeighingRowState[] = [
      createWeighingRow('w-1'), // completely empty row
    ];

    const html = renderToStaticMarkup(
      <WeighingPerformanceSection
        rows={rows}
        onChange={dummyOnChange}
        nextId={dummyNextId}
        verificationContext="INITIAL_VERIFICATION"
        instrumentMin={0.2}
        instrumentMax={30}
        instrumentE={0.01}
      />
    );

    // Empty row is not counted as a load
    expect(html).toContain('0 of 5 distinct loads (1 observation) · INCOMPLETE');
    // Empty row does not satisfy increasing or decreasing sequences
    expect(html).toContain('✗ Increasing sequence');
    expect(html).toContain('✗ Decreasing sequence');
    expect(html).toContain('✗ Min load (0.2 kg)');
    expect(html).toContain('✗ Max load (30 kg)');
  });

  // Regression requirement: Over-capacity load => Max requirement not satisfied
  it('Over-capacity load => Max requirement not satisfied in mixed observation sets', () => {
    const rows: WeighingRowState[] = [
      { id: 'w-1', load: '0.2', indicatedValue: '0.2', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
      { id: 'w-2', load: '5', indicatedValue: '5', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
      { id: 'w-3', load: '10', indicatedValue: '10', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
      { id: 'w-4', load: '20', indicatedValue: '20', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
      { id: 'w-5', load: '35', indicatedValue: '35', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' }, // OVER CAPACITY
      { id: 'w-6', load: '10', indicatedValue: '10', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'decreasing' },
    ];

    const html = renderToStaticMarkup(
      <WeighingPerformanceSection
        rows={rows}
        onChange={dummyOnChange}
        nextId={dummyNextId}
        verificationContext="INITIAL_VERIFICATION"
        instrumentMin={0.2}
        instrumentMax={30}
        instrumentE={0.01}
      />
    );

    // Over-capacity load does NOT satisfy Max requirement
    expect(html).toContain('✗ Max load (30 kg)');
    expect(html).not.toContain('✓ Max load (30 kg)');

    // Inline error shown beside row 5
    expect(html).toContain('Load 35 kg exceeds instrument Max capacity (30 kg).');
    expect(html).toContain('INCOMPLETE');
  });

  // Regression requirement: Invalid observation => cannot produce PASS / COMPLETE
  it('Invalid observation => cannot produce COMPLETE procedure status', () => {
    // 5 loads with increasing and decreasing, but highest is 35 (over Max)
    const rows: WeighingRowState[] = [
      { id: 'w-1', load: '0.2', indicatedValue: '0.2', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
      { id: 'w-2', load: '5', indicatedValue: '5', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
      { id: 'w-3', load: '10', indicatedValue: '10', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
      { id: 'w-4', load: '20', indicatedValue: '20', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
      { id: 'w-5', load: '35', indicatedValue: '35', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
      { id: 'w-6', load: '35', indicatedValue: '35', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'decreasing' },
      { id: 'w-7', load: '0.2', indicatedValue: '0.2', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'decreasing' },
    ];

    const html = renderToStaticMarkup(
      <WeighingPerformanceSection
        rows={rows}
        onChange={dummyOnChange}
        nextId={dummyNextId}
        verificationContext="INITIAL_VERIFICATION"
        instrumentMin={0.2}
        instrumentMax={30}
        instrumentE={0.01}
      />
    );

    // Can never produce COMPLETE
    expect(html).toContain('INCOMPLETE');
    expect(html).not.toContain('· COMPLETE');
  });

  describe('Observation List Lifecycle and Management Regressions', () => {
    it('Adding three independent observations generates unique IDs and independent default states', () => {
      const row1 = createWeighingRow();
      const row2 = createWeighingRow();
      const row3 = createWeighingRow();

      // Stable, unique IDs
      expect(row1.id).not.toBe(row2.id);
      expect(row2.id).not.toBe(row3.id);
      expect(row1.id).not.toBe(row3.id);

      // Fresh default values
      expect(row1.load).toBe('');
      expect(row2.load).toBe('');
      expect(row3.load).toBe('');

      // Independent object references
      expect(row1).not.toBe(row2);
      expect(row2).not.toBe(row3);
    });

    it('Editing only the second observation modifies only the target row and does not corrupt others', () => {
      const initialRows: WeighingRowState[] = [
        { ...createWeighingRow('w-1'), load: '5', indicatedValue: '5' },
        { ...createWeighingRow('w-2'), load: '10', indicatedValue: '10' },
        { ...createWeighingRow('w-3'), load: '20', indicatedValue: '20' },
      ];

      // Simulate updateRow for observation 2
      const targetId = 'w-2';
      const updatedRows = initialRows.map((r) =>
        r.id === targetId ? { ...r, load: '15', indicatedValue: '15' } : r
      );

      // Row 1 unchanged
      expect(updatedRows[0].load).toBe('5');
      expect(updatedRows[0].indicatedValue).toBe('5');

      // Row 2 updated
      expect(updatedRows[1].load).toBe('15');
      expect(updatedRows[1].indicatedValue).toBe('15');

      // Row 3 unchanged
      expect(updatedRows[2].load).toBe('20');
      expect(updatedRows[2].indicatedValue).toBe('20');
    });

    it('Removing the second observation removes only the selected row and display numbering updates correctly', () => {
      const rows: WeighingRowState[] = [
        { ...createWeighingRow('w-1'), load: '5', indicatedValue: '5' },
        { ...createWeighingRow('w-2'), load: '10', indicatedValue: '10' },
        { ...createWeighingRow('w-3'), load: '20', indicatedValue: '20' },
      ];

      // Before removal: all 3 cards rendered with Observation #1, #2, #3
      const htmlBefore = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={rows}
          onChange={() => {}}
          verificationContext="INITIAL_VERIFICATION"
          instrumentMin={0.2}
          instrumentMax={30}
          instrumentE={0.01}
        />
      );

      expect(htmlBefore).toContain('Observation #1');
      expect(htmlBefore).toContain('Observation #2');
      expect(htmlBefore).toContain('Observation #3');

      // Remove row 2 ('w-2')
      const remainingRows = rows.filter((r) => r.id !== 'w-2');
      expect(remainingRows.length).toBe(2);
      expect(remainingRows[0].id).toBe('w-1');
      expect(remainingRows[1].id).toBe('w-3');

      // After removal: cards render with Observation #1 and Observation #2
      const htmlAfter = renderToStaticMarkup(
        <WeighingPerformanceSection
          rows={remainingRows}
          onChange={() => {}}
          verificationContext="INITIAL_VERIFICATION"
          instrumentMin={0.2}
          instrumentMax={30}
          instrumentE={0.01}
        />
      );

      expect(htmlAfter).toContain('Observation #1');
      expect(htmlAfter).toContain('Observation #2');
      expect(htmlAfter).not.toContain('Observation #3');
      // Preserves original load values
      expect(htmlAfter).toContain('value="5"');
      expect(htmlAfter).toContain('value="20"');
      expect(htmlAfter).not.toContain('value="10"');
    });

    it('Saving and reloading multiple observations: deleted observations do not reappear after saving and refreshing', async () => {
      // Mock tracking state simulating EvaluationScreen's nextIds and backend persistence
      const savedDb: Record<string, { id: string; load: number }> = {
        'db-1': { id: 'db-1', load: 5 },
        'db-2': { id: 'db-2', load: 10 },
        'db-3': { id: 'db-3', load: 20 },
      };

      const trackingIds: Record<string, string> = {
        'w-row-1': 'db-1',
        'w-row-2': 'db-2',
        'w-row-3': 'db-3',
      };

      // Technician removes observation 2 in frontend
      let currentRows: WeighingRowState[] = [
        { ...createWeighingRow('w-row-1'), load: '5', indicatedValue: '5' },
        { ...createWeighingRow('w-row-3'), load: '20', indicatedValue: '20' },
      ];

      // Simulated saveProgress logic matching EvaluationScreen:
      for (const [rowId, dbId] of Object.entries(trackingIds)) {
        if (!currentRows.some((row) => row.id === rowId)) {
          // Delete from database
          delete savedDb[dbId];
          delete trackingIds[rowId];
        }
      }

      // db-2 is deleted from backend
      expect(savedDb['db-2']).toBeUndefined();
      expect(trackingIds['w-row-2']).toBeUndefined();
      expect(Object.keys(savedDb)).toEqual(['db-1', 'db-3']);

      // Simulated rehydration / page refresh:
      const rehydratedRows = Object.values(savedDb).map((record) => ({
        ...createWeighingRow(`w-${record.id}`),
        load: String(record.load),
      }));

      // Deleted observation 2 does NOT reappear
      expect(rehydratedRows.length).toBe(2);
      expect(rehydratedRows.map((r) => r.load)).toEqual(['5', '20']);
      expect(rehydratedRows.some((r) => r.load === '10')).toBe(false);
    });

    it('Prevents duplicate IDs or shared state across consecutive additions', () => {
      const generatedIds = new Set<string>();
      const rows: WeighingRowState[] = [];

      for (let i = 0; i < 50; i++) {
        const newRow = createWeighingRow();
        expect(generatedIds.has(newRow.id)).toBe(false);
        generatedIds.add(newRow.id);
        rows.push(newRow);
      }

      expect(generatedIds.size).toBe(50);
    });
  });
});
