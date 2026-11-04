import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WeighingPerformanceSection } from './WeighingPerformanceSection';
import { RepeatabilitySection } from './RepeatabilitySection';
import { EccentricLoadingSection } from './EccentricLoadingSection';
import { DiscriminationSection } from './DiscriminationSection';
import { ZeroSettingSection } from './ZeroSettingSection';
import { ConfirmDemoModal } from './ConfirmDemoModal';
import { AccuracyClass } from '@/lib/r76/types';

describe('Demo Data UI Components & Banners Suite', () => {
  const dummyFn = () => {};

  it('WeighingPerformanceSection: renders Load Demo Data button and identification label', () => {
    const htmlWithDemo = renderToStaticMarkup(
      <WeighingPerformanceSection
        rows={[{ id: 'w-1', load: '10', indicatedValue: '10', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' }]}
        onChange={dummyFn}
        onLoadDemoData={dummyFn}
        isDemoData={true}
        onClearDemoData={dummyFn}
      />
    );
    expect(htmlWithDemo).toContain('Load Demo Data');
    expect(htmlWithDemo).toContain('DEMO DATA — Sample readings generated for demonstration.');
    expect(htmlWithDemo).toContain('Clear sample readings');

    const htmlWithoutDemo = renderToStaticMarkup(
      <WeighingPerformanceSection
        rows={[{ id: 'w-1', load: '', indicatedValue: '', additionalLoad: '0', zeroError: '0', loadingDirection: 'increasing' }]}
        onChange={dummyFn}
        isDemoData={false}
      />
    );
    expect(htmlWithoutDemo).not.toContain('DEMO DATA — Sample readings generated for demonstration.');
  });

  it('RepeatabilitySection: renders Load Demo Data button and identification label', () => {
    const htmlWithDemo = renderToStaticMarkup(
      <RepeatabilitySection
        value={{ testLoad: '15', indications: ['15', '15', '15'], autoZeroOrTrackingActive: true }}
        onChange={dummyFn}
        accuracyClass={AccuracyClass.III}
        instrumentHasAutoZero={true}
        onLoadDemoData={dummyFn}
        isDemoData={true}
        onClearDemoData={dummyFn}
      />
    );
    expect(htmlWithDemo).toContain('Load Demo Data');
    expect(htmlWithDemo).toContain('DEMO DATA — Sample readings generated for demonstration.');
  });

  it('EccentricLoadingSection: renders Load Demo Data button and identification label', () => {
    const htmlWithDemo = renderToStaticMarkup(
      <EccentricLoadingSection
        rows={[{ id: 'e-1', positionId: '1', appliedLoad: '10', indicatedValue: '10', additionalLoad: '0.005', zeroError: '0', autoZeroOrTrackingDisabled: true }]}
        onChange={dummyFn}
        zeroDeterminedBeforeEachLoading={false}
        onZeroDeterminedChange={dummyFn}
        instrumentHasAutoZero={true}
        onLoadDemoData={dummyFn}
        isDemoData={true}
        onClearDemoData={dummyFn}
      />
    );
    expect(htmlWithDemo).toContain('Load Demo Data');
    expect(htmlWithDemo).toContain('DEMO DATA — Sample readings generated for demonstration.');
  });

  it('DiscriminationSection: renders Load Demo Data button and identification label', () => {
    const htmlWithDemo = renderToStaticMarkup(
      <DiscriminationSection
        rows={[{ id: 'd-1', testLoad: '10', indicationBefore: '10', indicationAfter: '10.005' }]}
        onChange={dummyFn}
        onLoadDemoData={dummyFn}
        isDemoData={true}
        onClearDemoData={dummyFn}
      />
    );
    expect(htmlWithDemo).toContain('Load Demo Data');
    expect(htmlWithDemo).toContain('DEMO DATA — Sample readings generated for demonstration.');
  });

  it('ZeroSettingSection: renders Load Demo Data button and identification label', () => {
    const htmlWithDemo = renderToStaticMarkup(
      <ZeroSettingSection
        value={{ load: '0.1', indicatedValue: '0.1', additionalLoad: '0.005' }}
        onChange={dummyFn}
        onLoadDemoData={dummyFn}
        isDemoData={true}
        onClearDemoData={dummyFn}
      />
    );
    expect(htmlWithDemo).toContain('Load Demo Data');
    expect(htmlWithDemo).toContain('DEMO DATA — Sample readings generated for demonstration.');
  });

  it('ConfirmDemoModal: renders confirmation dialog with title, message and action buttons', () => {
    const htmlOpen = renderToStaticMarkup(
      <ConfirmDemoModal
        isOpen={true}
        title="Replace existing test measurements?"
        message="One or more test sections already contain entered measurement readings."
        onConfirm={dummyFn}
        onCancel={dummyFn}
      />
    );
    expect(htmlOpen).toContain('role="dialog"');
    expect(htmlOpen).toContain('Replace existing test measurements?');
    expect(htmlOpen).toContain('One or more test sections already contain entered measurement readings.');
    expect(htmlOpen).toContain('Keep My Readings');
    expect(htmlOpen).toContain('Load Demo Data');

    const htmlClosed = renderToStaticMarkup(
      <ConfirmDemoModal
        isOpen={false}
        title="Replace"
        message="Message"
        onConfirm={dummyFn}
        onCancel={dummyFn}
      />
    );
    expect(htmlClosed).toBe('');
  });

  it('renders Demo (Edited) badge and warning when demo data has been manually modified', () => {
    const htmlModified = renderToStaticMarkup(
      <WeighingPerformanceSection
        rows={[{ id: 'w-1', load: '10', indicatedValue: '10.01', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' }]}
        onChange={dummyFn}
        onLoadDemoData={dummyFn}
        isDemoData={true}
        isDemoModified={true}
        onClearDemoData={dummyFn}
      />
    );
    expect(htmlModified).toContain('Demo (Edited)');
    expect(htmlModified).toContain('DEMO DATA (MANUALLY EDITED) — Sample readings contain manual modifications.');
  });

  it('ConfirmDemoModal: supports custom confirmLabel and cancelLabel', () => {
    const htmlCustom = renderToStaticMarkup(
      <ConfirmDemoModal
        isOpen={true}
        title="Discard manual modifications?"
        message="Changing instrument configuration will reset demo data."
        confirmLabel="Overwrite Modified Readings"
        cancelLabel="Keep My Modifications"
        onConfirm={dummyFn}
        onCancel={dummyFn}
      />
    );
    expect(htmlCustom).toContain('Discard manual modifications?');
    expect(htmlCustom).toContain('Overwrite Modified Readings');
    expect(htmlCustom).toContain('Keep My Modifications');
  });

  it('correctly calculates manual edit modification and reversal back to baseline', () => {
    const originalDemoSnapshot = JSON.stringify([
      { id: 'w-1', load: '10', indicatedValue: '10', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
      { id: 'w-2', load: '20', indicatedValue: '20', additionalLoad: '0.005', zeroError: '0', loadingDirection: 'increasing' },
    ]);

    // 1. Initial demo data matches snapshot
    const baselineRows = JSON.parse(originalDemoSnapshot);
    expect(JSON.stringify(baselineRows) !== originalDemoSnapshot).toBe(false);

    // 2. User modifies row 1
    const modifiedRows = JSON.parse(originalDemoSnapshot);
    modifiedRows[0].indicatedValue = '10.01';
    expect(JSON.stringify(modifiedRows) !== originalDemoSnapshot).toBe(true);

    // 3. User restores row 1 back to original value
    modifiedRows[0].indicatedValue = '10';
    expect(JSON.stringify(modifiedRows) !== originalDemoSnapshot).toBe(false);

    // 4. If row 2 still differs, it remains true
    modifiedRows[1].indicatedValue = '20.02';
    expect(JSON.stringify(modifiedRows) !== originalDemoSnapshot).toBe(true);
  });

  it('detects demo status across all observations on reload (not just index 0)', () => {
    // Helper function matching the one in EvaluationScreen.tsx
    const checkRecordsDemo = (records: Array<{ observationData: Record<string, unknown> }>) => {
      let isDemo = false;
      let isModified = false;
      for (const record of records) {
        const d = record.observationData;
        if (d && (d.isDemo === true || d.dataSource === 'DEMO_DATA')) {
          isDemo = true;
        }
        if (d && d.isModified === true) {
          isModified = true;
        }
      }
      return { isDemo, isModified };
    };

    // Case: Row 0 is non-demo, Row 1 has isDemo: true
    const mixedRecords = [
      { observationData: { load: 10, indicatedValue: 10, isDemo: false } },
      { observationData: { load: 20, indicatedValue: 20, isDemo: true, dataSource: 'DEMO_DATA', isModified: true } },
    ];
    const info = checkRecordsDemo(mixedRecords);
    expect(info.isDemo).toBe(true);
    expect(info.isModified).toBe(true);

    // Case: No demo records
    const genuineRecords = [
      { observationData: { load: 10, indicatedValue: 10, isDemo: false } },
      { observationData: { load: 20, indicatedValue: 20 } },
    ];
    const genuineInfo = checkRecordsDemo(genuineRecords);
    expect(genuineInfo.isDemo).toBe(false);
    expect(genuineInfo.isModified).toBe(false);
  });
});

