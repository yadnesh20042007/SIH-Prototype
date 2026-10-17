import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { selectTests } from '@/lib/r76/test-selection/engine';
import { VerificationContext, TestType, InstrumentType, AccuracyClass, normalizeVerificationContext, isTypeEvaluationContext } from '@/lib/r76/types';
import { evaluateWeighingObservation } from '@/lib/r76/calculations/weighing';
import { calculateMPE } from '@/lib/r76/calculations/mpe';

export interface ReportObservationData {
  testType: string;
  sequenceIndex: number;
  observationData: Record<string, unknown>;
}

export interface ReportResultData {
  testType: string;
  outcome: string;
  maxAbsoluteError: string;
  mpe: string;
  repeatabilityRange: string | null;
  r76Reference: string;
  explanation: string;
  complianceTrace: Record<string, unknown>;
}

export interface R76ReportData {
  reportId: string;
  referenceNumber: string;
  issuedAt: string;
  verificationUrl: string;
  session: {
    id: string;
    status: string;
    verificationContext: string;
    createdAt: string;
    completedAt: string | null;
    technician: { name: string };
    reviewer: { name: string } | null;
    approver: { name: string } | null;
    rulesetVersion: { standard: string; version: string };
    instrument: {
      model: string;
      serialNumber: string | null;
      accuracyClass: string;
      instrumentType: string;
      indicationType?: string | null;
      zeroSettingMechanisms?: string[] | null;
      max: string;
      min: string;
      e: string;
      d: string;
      numberOfSupportPoints: number;
      additiveTareEffect: boolean;
      hasAutoZeroOrTracking: boolean;
      hasInitialZeroSettingDevice: boolean;
      initialZeroSettingRange: string;
      hasFineDisplayDevice: boolean;
      manufacturer: { name: string; country: string | null; registrationCode: string | null };
    };
    observations: ReportObservationData[];
    results: ReportResultData[];
    approvals: Array<{
      action: string;
      comments: string | null;
      createdAt: string;
      user: { name: string; role: string };
    }>;
  };
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 42;
const CONTENT_WIDTH = A4[0] - MARGIN * 2;

export function getReportTitle(context: string): { title: string; shortName: string } {
  const norm = (context || '').toUpperCase().replace(/[\s-]+/g, '_');
  switch (norm) {
    case 'INITIAL_VERIFICATION':
      return {
        title: 'OIML R 76-2:2007-aligned Initial Verification Report',
        shortName: 'Initial Verification',
      };
    case 'SUBSEQUENT_VERIFICATION':
      return {
        title: 'OIML R 76-2:2007-aligned Subsequent Verification Report',
        shortName: 'Subsequent Verification',
      };
    case 'SERVICE_INSPECTION':
      return {
        title: 'OIML R 76-2:2007-aligned In-Service Inspection Report',
        shortName: 'In-Service Inspection',
      };
    case 'TYPE_EVALUATION':
    default:
      return {
        title: 'OIML R 76-2:2007-aligned Type Evaluation Report',
        shortName: 'Type Evaluation',
      };
  }
}

function parseVerificationContext(raw: string): VerificationContext {
  return normalizeVerificationContext(raw);
}

function safeText(value: unknown): string {
  return String(value ?? 'Not recorded')
    .replaceAll('Δ', 'Delta ')
    .replaceAll('≤', '<=')
    .replaceAll('≥', '>=')
    .replaceAll('±', '+/-')
    .replace(/[−–—]/g, '-')
    .replace(/[➔→]/g, '->')
    .replaceAll('§', 'Section ')
    .replaceAll('×', 'x')
    .replaceAll('µ', 'u')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '?');
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safeText(text).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function renderR76ReportPdf(data: R76ReportData): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page!: PDFPage;
  let y = 0;

  const { title: reportHeaderTitle, shortName: contextShortName } = getReportTitle(
    data.session.verificationContext
  );

  function addPage(title?: string): void {
    page = document.addPage(A4);
    y = A4[1] - MARGIN;
    page.drawText(reportHeaderTitle, {
      x: MARGIN,
      y,
      size: 8,
      font: bold,
      color: rgb(0.12, 0.18, 0.24),
    });
    page.drawText(data.referenceNumber, {
      x: A4[0] - MARGIN - regular.widthOfTextAtSize(data.referenceNumber, 8),
      y,
      size: 8,
      font: regular,
      color: rgb(0.35, 0.4, 0.45),
    });
    y -= 16;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 0.7,
      color: rgb(0.55, 0.6, 0.65),
    });
    y -= 22;
    if (title) heading(title, 15);
  }

  function ensure(height: number): void {
    if (y - height < 48) addPage();
  }

  function text(
    value: string,
    options: {
      size?: number;
      font?: PDFFont;
      indent?: number;
      gap?: number;
      color?: ReturnType<typeof rgb>;
    } = {}
  ): void {
    const size = options.size ?? 8.5;
    const font = options.font ?? regular;
    const indent = options.indent ?? 0;
    const lines = wrap(value, font, size, CONTENT_WIDTH - indent);
    ensure(lines.length * (size + 3));
    for (const line of lines) {
      page.drawText(line, {
        x: MARGIN + indent,
        y,
        size,
        font,
        color: options.color ?? rgb(0.12, 0.14, 0.16),
      });
      y -= size + 3;
    }
    y -= options.gap ?? 3;
  }

  function heading(value: string, size = 12): void {
    ensure(size + 18);
    page.drawText(safeText(value), {
      x: MARGIN,
      y,
      size,
      font: bold,
      color: rgb(0.06, 0.25, 0.43),
    });
    y -= size + 5;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 0.6,
      color: rgb(0.65, 0.75, 0.83),
    });
    y -= 10;
  }

  function keyValues(items: Array<[string, unknown]>): void {
    for (const [key, value] of items) {
      ensure(18);
      page.drawText(safeText(key), {
        x: MARGIN,
        y,
        size: 8,
        font: bold,
        color: rgb(0.25, 0.29, 0.33),
      });
      const rendered =
        value === null || value === undefined || value === '' ? 'Not recorded' : safeText(value);
      const lines = wrap(rendered, regular, 8, CONTENT_WIDTH - 165);
      lines.forEach((line, index) =>
        page.drawText(line, { x: MARGIN + 165, y: y - index * 11, size: 8, font: regular })
      );
      y -= Math.max(15, lines.length * 11 + 3);
    }
    y -= 4;
  }

  function table(headers: string[], rows: string[][], widths: number[]): void {
    const baseHeight = 20;
    const drawRow = (cells: string[], isHeader: boolean) => {
      const fontToUse = isHeader ? bold : regular;
      const fontSize = isHeader ? 7.2 : 7;
      const cellLines = cells.map((cell, index) =>
        wrap(cell, fontToUse, fontSize, widths[index] - 8)
      );
      const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
      const rowHeight = Math.max(baseHeight, maxLines * 10 + 7);
      ensure(rowHeight);
      let x = MARGIN;
      cells.forEach((_, index) => {
        page.drawRectangle({
          x,
          y: y - rowHeight + 5,
          width: widths[index],
          height: rowHeight,
          borderWidth: 0.5,
          borderColor: rgb(0.65, 0.68, 0.72),
          color: isHeader ? rgb(0.93, 0.95, 0.97) : rgb(1, 1, 1),
        });
        const lines = cellLines[index];
        lines.forEach((line, lineIdx) => {
          page.drawText(line, {
            x: x + 4,
            y: y - 8 - lineIdx * 10,
            size: fontSize,
            font: fontToUse,
            color: isHeader ? rgb(0.12, 0.18, 0.24) : rgb(0.15, 0.17, 0.2),
          });
        });
        x += widths[index];
      });
      y -= rowHeight;
    };
    drawRow(headers, true);
    rows.forEach((row) => drawRow(row, false));
    y -= 10;
  }

  const instrument = data.session.instrument;
  const context = parseVerificationContext(data.session.verificationContext);

  // Reconstruct instrument for selection engine
  const instForSelection = {
    id: data.session.id,
    manufacturer: instrument.manufacturer.name,
    model: instrument.model,
    serialNumber: instrument.serialNumber ?? undefined,
    accuracyClass: (instrument.accuracyClass as AccuracyClass) || AccuracyClass.III,
    instrumentType:
      instrument.instrumentType?.toLowerCase() === 'single_range'
        ? InstrumentType.SingleRange
        : (instrument.instrumentType?.toLowerCase() as any),
    indicationType: (instrument.indicationType?.toLowerCase() ?? 'digital') as any,
    zeroSettingMechanisms: Array.isArray(instrument.zeroSettingMechanisms)
      ? instrument.zeroSettingMechanisms.map((m) => m.toLowerCase() as any)
      : undefined,
    max: Number(instrument.max) || 0,
    min: Number(instrument.min) || 0,
    e: Number(instrument.e) || 0,
    d: Number(instrument.d) || 0,
    numberOfSupportPoints: Number(instrument.numberOfSupportPoints) || 4,
    additiveTareEffect: Boolean(instrument.additiveTareEffect),
    hasAutoZeroOrTracking: Boolean(instrument.hasAutoZeroOrTracking),
    hasInitialZeroSettingDevice: Boolean(instrument.hasInitialZeroSettingDevice),
    initialZeroSettingRange: Number(instrument.initialZeroSettingRange || 0),
    hasFineDisplayDevice: Boolean(instrument.hasFineDisplayDevice),
  };

  const testSelections = selectTests(instForSelection as any, context);

  interface ModuleConfig {
    testType: string;
    engineType: TestType;
    name: string;
    formRef: string;
  }

  const MODULES: ModuleConfig[] = [
    {
      testType: 'WEIGHING_PERFORMANCE',
      engineType: TestType.WeighingPerformance,
      name: 'Weighing Performance',
      formRef: '1',
    },
    {
      testType: 'ECCENTRIC_LOADING',
      engineType: TestType.EccentricLoading,
      name: 'Eccentricity using weights',
      formRef: '3.1',
    },
    {
      testType: 'DISCRIMINATION',
      engineType: TestType.Discrimination,
      name: 'Discrimination',
      formRef: '4',
    },
    {
      testType: 'REPEATABILITY',
      engineType: TestType.Repeatability,
      name: 'Repeatability',
      formRef: '5',
    },
    {
      testType: 'ZERO_SETTING_ACCURACY',
      engineType: TestType.ZeroSettingAccuracy,
      name: 'Zero-setting Accuracy',
      formRef: 'A.4.2.3',
    },
  ];

  const summaryRows = MODULES.map((mod) => {
    const selection = testSelections.find((s) => s.testType === mod.engineType);
    const result = data.session.results.find((r) => r.testType === mod.testType);
    const obs = data.session.observations.filter((o) => o.testType === mod.testType);

    let status = 'NOT APPLICABLE';
    let remarks = selection?.reason ?? 'Not applicable for this instrument configuration.';

    if (selection && !selection.isApplicable) {
      status = 'NOT APPLICABLE';
      remarks = selection.reason;
    } else {
      // Test is applicable
      if (result) {
        status = result.outcome;
        remarks = result.r76Reference || result.explanation || 'Evaluated';
      } else if (obs.length === 0) {
        status = 'NOT PERFORMED';
        remarks = `Required test was not performed (${selection?.r76Reference ?? 'OIML R 76-1'})`;
      } else {
        status = 'INCOMPLETE';
        if (mod.testType === 'ECCENTRIC_LOADING') {
          const reqPoints = instForSelection.numberOfSupportPoints === 3 ? 3 : 4;
          const testedIds = new Set(
            obs.map((o) => String(o.observationData?.positionId || '')).filter(Boolean)
          );
          remarks = `Incomplete: ${testedIds.size} of ${reqPoints} required positions recorded`;
        } else {
          remarks = 'Required observations are incomplete or not evaluated';
        }
      }
    }

    return {
      mod,
      selection,
      result,
      obs,
      status,
      remarks,
    };
  });

  const failedTests = summaryRows.filter((r) => r.status === 'FAIL');
  const failedTestNames = failedTests.map((r) => r.mod.name);
  const anyTechnicalFail = failedTests.length > 0;

  const incompleteTests = summaryRows.filter(
    (r) => (r.selection?.isApplicable ?? true) && (r.status === 'INCOMPLETE' || r.status === 'NOT PERFORMED')
  );
  const incompleteTestNames = incompleteTests.map((r) => `${r.mod.name} (${r.status})`);
  const anyIncomplete = incompleteTests.length > 0;

  const anyRetest = summaryRows.some(
    (r) => r.status === 'REQUIRES_RETEST' || r.status === 'REQUIRES RETEST'
  );
  const applicablePassed = summaryRows
    .filter((r) => r.selection?.isApplicable)
    .every((r) => r.status === 'PASS');

  const overallTechnicalOutcome = anyTechnicalFail
    ? 'FAIL (NON-COMPLIANT)'
    : anyIncomplete
    ? 'INCOMPLETE (Unresolved testing)'
    : anyRetest
    ? 'REQUIRES RETEST'
    : applicablePassed
    ? 'PASS (COMPLIANT)'
    : 'NOT AVAILABLE';

  const completenessDescription = anyIncomplete
    ? `INCOMPLETE (${incompleteTests.length} required test(s) not performed or incomplete: ${incompleteTestNames.join(', ')})`
    : 'COMPLETE (All applicable test procedures performed)';

  const documentClassification = anyTechnicalFail
    ? anyIncomplete
      ? 'NON-COMPLIANCE TEST REPORT (INCOMPLETE TESTING)'
      : 'NON-COMPLIANCE TEST REPORT'
    : anyIncomplete
    ? 'INCOMPLETE EVALUATION TEST REPORT'
    : 'VERIFICATION TEST REPORT';

  const isTypeEval = isTypeEvaluationContext(data.session.verificationContext);
  addPage(
    isTypeEval
      ? '1. General Information concerning the Type'
      : '1. General Information concerning the Instrument'
  );

  if (anyTechnicalFail && anyIncomplete) {
    text(
      `NOTICE: This document records metrological NON-COMPLIANCE under OIML R 76-1:2006. In addition, required regulatory testing is INCOMPLETE (${incompleteTestNames.join(', ')}). This report does NOT represent a complete regulatory evaluation and cannot be used for statutory verification or type approval.`,
      { size: 8, color: rgb(0.7, 0.15, 0.15), gap: 9 }
    );
  } else if (anyTechnicalFail) {
    text(
      'NOTICE: This document is a finalized test report recording metrological NON-COMPLIANCE under OIML R 76-1:2006. It is NOT a certificate of verification or type approval. It is generated by the laboratory application and is not issued or endorsed by OIML or any statutory authority.',
      { size: 8, color: rgb(0.7, 0.15, 0.15), gap: 9 }
    );
  } else if (anyIncomplete) {
    text(
      `NOTICE: Required regulatory testing is INCOMPLETE (${incompleteTestNames.join(', ')}). This document records observations for performed modules only and does not represent a complete regulatory evaluation under OIML R 76.`,
      { size: 8, color: rgb(0.7, 0.35, 0.1), gap: 9 }
    );
  } else {
    text(
      'This report is aligned to the applicable forms in OIML R 76-2:2007 and requirements in OIML R 76-1:2006. Approval confirms verified testing records; it does not constitute official government or OIML certification unless issued under competent legal authority.',
      { size: 8, color: rgb(0.35, 0.38, 0.42), gap: 9 }
    );
  }

  keyValues([
    ['Report / application reference', data.referenceNumber],
    ['Document classification', documentClassification],
    ['Overall technical outcome', overallTechnicalOutcome],
    ['Evaluation procedure completeness', completenessDescription],
    ['Internal report ID', data.reportId],
    ['Type / model designation', instrument.model],
    ['Manufacturer', instrument.manufacturer.name],
    ['Manufacturer country', instrument.manufacturer.country],
    ['Manufacturer registration code', instrument.manufacturer.registrationCode],
    ['Serial number', instrument.serialNumber],
    ['Instrument type / category', instrument.instrumentType],
    ['Accuracy class', instrument.accuracyClass],
    ['Minimum capacity Min', `${instrument.min} kg`],
    ['Maximum capacity Max', `${instrument.max} kg`],
    ['Verification scale interval e', `${instrument.e} kg`],
    ['Actual scale interval d', `${instrument.d} kg`],
    ['Load-receptor support points', instrument.numberOfSupportPoints],
    ['Additive tare device', instrument.additiveTareEffect ? 'Fitted' : 'Not fitted'],
    ['Automatic zero / tracking', instrument.hasAutoZeroOrTracking ? 'Fitted' : 'Not fitted'],
    [
      'Initial zero-setting device',
      instrument.hasInitialZeroSettingDevice ? 'Fitted' : 'Not fitted',
    ],
    ['Initial zero-setting range', instrument.initialZeroSettingRange],
    ['Fine display device', instrument.hasFineDisplayDevice ? 'Fitted' : 'Not fitted'],
    [
      'Verification context',
      instrument ? data.session.verificationContext : 'Not recorded',
    ],
    [
      'Ruleset version',
      `${data.session.rulesetVersion.standard}:${data.session.rulesetVersion.version}`,
    ],
    [
      'Evaluation period',
      `${data.session.createdAt} to ${data.session.completedAt ?? 'Not recorded'}`,
    ],
    ['Report date', data.issuedAt],
    ['Observer / technician', data.session.technician.name],
    ['Session reference', data.session.id],
    ['Environment / equipment / applicant', 'Not recorded'],
  ]);

  addPage(`2. Summary of ${contextShortName}`);
  text(
    'This generated report summarizes the five OIML R 76 test modules supported by the evaluation engine.',
    { gap: 10 }
  );

  table(
    ['Test', 'R76-2', 'Status', 'Remarks / Reason'],
    summaryRows.map((r) => [r.mod.name, r.mod.formRef, r.status, r.remarks]),
    [140, 45, 95, 231]
  );

  keyValues([
    ['Evaluation completeness', completenessDescription],
    ['Overall technical outcome', overallTechnicalOutcome],
    ['Human approval status', `${data.session.status} (Administrative Sign-off)`],
    ...(anyTechnicalFail ? [['Failed test modules', failedTestNames.join(', ') || 'One or more tests failed'] as [string, unknown]] : []),
    ...(anyIncomplete ? [['Incomplete / unperformed modules', incompleteTests.map(t => `${t.mod.name}: ${t.status}`).join(', ')] as [string, unknown]] : []),
  ]);
  if (anyIncomplete) {
    text(
      `PROCEDURAL INCOMPLETENESS NOTICE: Required regulatory testing is INCOMPLETE (${incompleteTestNames.join(', ')}). This report does NOT represent a complete regulatory evaluation under OIML R 76. Missing required procedures must be completed before statutory verification or full type evaluation can be recognized.`,
      { size: 7.5, color: rgb(0.7, 0.35, 0.1) }
    );
  }
  if (anyTechnicalFail) {
    text(
      'NON-COMPLIANCE FINDING: One or more evaluated test modules failed applicable tolerance criteria or Maximum Permissible Error (MPE) limits. This instrument does NOT meet compliance requirements for legal metrological use.',
      { size: 7.5, color: rgb(0.7, 0.15, 0.15) }
    );
  }
  text(
    'Tests marked NOT APPLICABLE are excluded based on regulatory context or instrument features. Missing required observations are flagged as INCOMPLETE or NOT PERFORMED.',
    { size: 7.5, color: rgb(0.35, 0.38, 0.42) }
  );

  // Detailed test sections: Only generate for applicable, performed tests that have observations
  const detailedTests = summaryRows.filter((row) => {
    return (row.selection?.isApplicable ?? false) && row.result && row.obs.length > 0;
  });

  for (const { mod, result, obs } of detailedTests) {
    if (!result) continue;
    const sortedObs = [...obs].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    addPage(`${mod.formRef}. ${mod.name}`);
    text(`Persisted test outcome: ${result.outcome}`, { font: bold });
    text(result.explanation);

    if (mod.testType === 'WEIGHING_PERFORMANCE') {
      const e = Number(instrument.e);
      const isTypeEval = isTypeEvaluationContext(data.session.verificationContext);
      const requiredLoads = isTypeEval ? 10 : 5;
      const distinctLoads = new Set(
        sortedObs
          .map((item) => Number((item.observationData as Record<string, unknown>).load))
          .filter((v) => !isNaN(v))
      ).size;
      const hasInc = sortedObs.some(
        (item) => (item.observationData as Record<string, unknown>).loadingDirection === 'increasing'
      );
      const hasDec = sortedObs.some(
        (item) => (item.observationData as Record<string, unknown>).loadingDirection === 'decreasing'
      );
      const isComplete = distinctLoads >= requiredLoads && hasInc && hasDec;

      table(
        ['Dir', 'L kg', 'I kg', 'Delta L kg', 'E kg', 'Ec kg', 'MPE kg', 'Result'],
        sortedObs.map((item, idx) => {
          const o = item.observationData as Record<string, unknown>;
          const L = Number(o.load);
          const I = Number(o.indicatedValue);
          const deltaL = o.additionalLoad !== undefined && o.additionalLoad !== null && o.additionalLoad !== ''
            ? Number(o.additionalLoad)
            : undefined;
          const zeroError = Number(o.zeroError ?? 0);
          const dir = o.loadingDirection === 'decreasing' ? 'Dec' : 'Inc';

          // 1. Check persisted compliance trace first
          const obsTraces = Array.isArray((result.complianceTrace as any)?.observationTraces)
            ? ((result.complianceTrace as any).observationTraces as any[])
            : null;
          const traceItem = obsTraces?.find((t: any) => t.sequenceIndex === item.sequenceIndex) ?? obsTraces?.[idx];

          if (traceItem) {
            const mpeVal = traceItem.mpe !== undefined ? String(traceItem.mpe) : String(result.mpe);
            const ecVal = traceItem.calculatedError !== undefined ? String(traceItem.calculatedError) : 'Not recorded';
            const passVal = traceItem.outcome ? traceItem.outcome.toUpperCase() : (traceItem.trace?.comparison?.passed ? 'PASS' : 'FAIL');
            const eVal = traceItem.trace?.calculationSteps?.find((s: any) => s.label?.includes('Error before') || s.label === 'E')?.result;
            return [
              dir,
              String(L),
              String(I),
              deltaL !== undefined ? String(deltaL) : 'Missing ΔL',
              eVal !== undefined ? String(eVal) : 'Not recorded',
              ecVal,
              mpeVal,
              passVal,
            ];
          }

          // 2. Authoritative per-observation engine evaluation
          if (!isNaN(L) && !isNaN(I) && e > 0) {
            if (deltaL !== undefined && !isNaN(deltaL)) {
              try {
                const evalObs = evaluateWeighingObservation(
                  {
                    sequenceIndex: item.sequenceIndex,
                    load: L,
                    indicatedValue: I,
                    additionalLoad: deltaL,
                    zeroError,
                    loadingDirection: o.loadingDirection as any,
                  },
                  instForSelection as any,
                  context
                );
                return [
                  dir,
                  String(L),
                  String(I),
                  String(deltaL),
                  String(evalObs.errorPriorToRounding),
                  String(evalObs.calculatedError),
                  String(evalObs.mpe),
                  evalObs.outcome.toUpperCase(),
                ];
              } catch {
                // In case of evaluation error, fall through
              }
            } else {
              // Missing additionalLoad: evaluate authoritative MPE for this load band, but mark incomplete
              let mpeBand = String(result.mpe);
              try {
                const mpeRes = calculateMPE(instForSelection.accuracyClass as any, L, e, context);
                mpeBand = String(mpeRes.effectiveMPE);
              } catch {}
              return [
                dir,
                String(L),
                String(I),
                'Missing ΔL',
                'Missing ΔL',
                'Missing ΔL',
                mpeBand,
                'INCOMPLETE',
              ];
            }
          }

          return [
            dir,
            String(o.load ?? 'Not recorded'),
            String(o.indicatedValue ?? 'Not recorded'),
            deltaL !== undefined ? String(deltaL) : 'Missing ΔL',
            'Not recorded',
            'Not recorded',
            result.mpe,
            result.outcome,
          ];
        }),
        [45, 60, 60, 65, 60, 60, 70, 91]
      );
      keyValues([
        ['Procedure completeness', isComplete ? `COMPLETE (${distinctLoads} of ${requiredLoads} test loads, inc & dec)` : `INCOMPLETE (${distinctLoads} of ${requiredLoads} test loads)`],
      ]);
    } else if (mod.testType === 'ECCENTRIC_LOADING') {
      const e = Number(instrument.e);
      const mpe = Number(result.mpe);
      const maxCapacity = Number(instrument.max) || 0;
      const points = Number(instrument.numberOfSupportPoints) || 4;
      const requiredPositionsCount = points === 3 ? 3 : 4;
      const prescribedLoad = Math.round((maxCapacity / 3) * 1e4) / 1e4;
      const loadTolerance = Math.max(1e-6, e);

      const actualLoads = sortedObs
        .map((item) => Number((item.observationData as Record<string, unknown>).appliedLoad))
        .filter((v) => !isNaN(v));
      const hasOverCapacity = actualLoads.some((l) => l > maxCapacity);
      const hasLoadMismatch = actualLoads.some((l) => Math.abs(l - prescribedLoad) > loadTolerance);
      const validObsCount = sortedObs.filter((item) => {
        const o = item.observationData as Record<string, unknown>;
        const L = Number(o.appliedLoad);
        return !isNaN(L) && L <= maxCapacity && Math.abs(L - prescribedLoad) <= loadTolerance;
      }).length;
      const isComplete = validObsCount >= requiredPositionsCount;

      keyValues([
        ['Prescribed test load (1/3 Max)', `${prescribedLoad} kg`],
        [
          'Actual applied test load(s)',
          actualLoads.length > 0 ? `${Array.from(new Set(actualLoads)).join(', ')} kg` : 'Not recorded',
        ],
        [
          'Applied load compliance status',
          hasOverCapacity
            ? 'NON-COMPLIANT: Applied load exceeds instrument Max capacity'
            : hasLoadMismatch
            ? 'NON-COMPLIANT: Applied load does not match prescribed 1/3 Max load'
            : 'COMPLIANT: Applied load matches prescribed test load',
        ],
        ['Required loading positions', `${requiredPositionsCount} positions (${points} support points)`],
        [
          'Procedure completeness',
          isComplete
            ? `COMPLETE (${validObsCount} of ${requiredPositionsCount} positions valid)`
            : `INCOMPLETE (${validObsCount} of ${requiredPositionsCount} positions valid)`,
        ],
      ]);

      table(
        ['Position', 'Prescribed', 'Actual L', 'I kg', 'Delta L', 'Ec kg', 'Result'],
        sortedObs.map((item) => {
          const o = item.observationData as Record<string, unknown>;
          const L = Number(o.appliedLoad);
          const I = Number(o.indicatedValue);
          const deltaL = Number(o.additionalLoad ?? 0);
          const E0 = Number(o.zeroError ?? 0);
          if (!isNaN(L) && !isNaN(I) && e > 0) {
            const P = Math.round((I + 0.5 * e - deltaL) * 1e8) / 1e8;
            const E = Math.round((P - L) * 1e8) / 1e8;
            const Ec = Math.round((E - E0) * 1e8) / 1e8;
            const isPass = Math.abs(Ec) - mpe <= 1e-9;
            const isOverCapacity = L > maxCapacity;
            const isMismatch = Math.abs(L - prescribedLoad) > loadTolerance;

            let posOutcome = isPass
              ? 'PASS'
              : result.outcome === 'REQUIRES_RETEST'
              ? 'RETEST'
              : 'FAIL';

            if (isOverCapacity) {
              posOutcome = 'INVALID (> Max)';
            } else if (isMismatch) {
              posOutcome = 'INVALID (Load mismatch)';
            }

            return [
              String(o.positionId ?? 'Unknown'),
              `${prescribedLoad} kg`,
              `${L} kg`,
              String(I),
              String(deltaL),
              String(Ec),
              posOutcome,
            ];
          }
          return [
            String(o.positionId ?? 'Unknown'),
            `${prescribedLoad} kg`,
            String(o.appliedLoad ?? 'Not recorded'),
            String(o.indicatedValue ?? 'Not recorded'),
            String(o.additionalLoad ?? 0),
            'Not recorded',
            result.outcome,
          ];
        }),
        [60, 65, 65, 60, 60, 60, 141]
      );
    } else if (mod.testType === 'ZERO_SETTING_ACCURACY') {
      const e = Number(instrument.e);
      const limit = Math.round(0.25 * e * 1e8) / 1e8;
      table(
        ['Run', 'L kg', 'I kg', 'Delta L kg', 'E0 kg', 'Limit (+/-0.25e)', 'Result'],
        sortedObs.map((item, idx) => {
          const o = item.observationData as Record<string, unknown>;
          const L = Number(o.load);
          const I = Number(o.indicatedValue);
          const deltaL = Number(o.additionalLoad ?? 0);
          if (!isNaN(L) && !isNaN(I) && e > 0) {
            const P = Math.round((I + 0.5 * e - deltaL) * 1e8) / 1e8;
            const E0 = Math.round((P - L) * 1e8) / 1e8;
            const isPass = Math.abs(E0) - limit <= 1e-9;
            return [
              String(idx + 1),
              String(L),
              String(I),
              String(deltaL),
              String(E0),
              `+/- ${limit} kg`,
              isPass ? 'PASS' : 'FAIL',
            ];
          }
          return [
            String(idx + 1),
            String(o.load ?? 'Not recorded'),
            String(o.indicatedValue ?? 'Not recorded'),
            String(o.additionalLoad ?? 0),
            'Not recorded',
            `+/- ${limit} kg`,
            result.outcome,
          ];
        }),
        [55, 65, 65, 75, 75, 95, 81]
      );
    } else if (mod.testType === 'DISCRIMINATION') {
      table(
        ['Point', 'Load L kg', 'I before kg', 'Extra load (1.4d)', 'I after kg', 'Result'],
        sortedObs.map((item, index) => {
          const o = item.observationData as Record<string, unknown>;
          return [
            String(index + 1),
            String(o.testLoad ?? 'Not recorded'),
            String(o.indicationBefore ?? 'Not recorded'),
            '1.4d',
            String(o.indicationAfter ?? 'Not recorded'),
            result.outcome,
          ];
        }),
        [55, 90, 95, 95, 95, 81]
      );
    } else {
      // REPEATABILITY
      const observation = sortedObs[0]?.observationData as Record<string, unknown> | undefined;
      const rawSeries = Array.isArray(observation?.series) ? (observation.series as Array<{ seriesNumber: number; testLoad: number; indications: number[] }>) : null;
      if (rawSeries && rawSeries.length > 0) {
        table(
          ['Series', 'Test Load kg', 'Run', 'Indication I kg'],
          rawSeries.flatMap((s) =>
            (s.indications || []).map((ind, idx) => [
              `Series ${s.seriesNumber}`,
              String(s.testLoad),
              String(idx + 1),
              String(ind),
            ])
          ),
          [100, 120, 100, 186]
        );
      } else {
        const indications = Array.isArray(observation?.indications) ? observation.indications : [];
        table(
          ['Run', 'Load kg', 'Indication I kg', 'Per-run error'],
          indications.map((indication, index) => [
            String(index + 1),
            String(observation?.testLoad ?? 'Not recorded'),
            String(indication),
            'Not recorded',
          ]),
          [65, 120, 150, 176]
        );
      }
      keyValues([
        ['Emax - Emin / repeatability range', result.repeatabilityRange],
        ['Applicable MPE', `${result.mpe} kg`],
        ['Result', result.outcome],
      ]);
    }

    keyValues([
      ['Persisted R76 reference', result.r76Reference],
      ['Maximum absolute error', `${result.maxAbsoluteError} kg`],
      ['MPE', `${result.mpe} kg`],
    ]);
  }

  addPage('Supplement A. Software-generated Compliance Trace');
  text(
    'This supplementary traceability section is generated by the application from persisted engine output. It is not an original OIML R 76-2 form.',
    { gap: 10 }
  );

  const nameByType: Record<string, string> = {
    WEIGHING_PERFORMANCE: 'Weighing Performance',
    ECCENTRIC_LOADING: 'Eccentricity using weights',
    DISCRIMINATION: 'Discrimination',
    REPEATABILITY: 'Repeatability',
    ZERO_SETTING_ACCURACY: 'Zero-setting Accuracy',
  };

  for (const result of data.session.results) {
    heading(nameByType[result.testType] ?? result.testType, 10);
    const trace = result.complianceTrace as {
      references?: Array<Record<string, unknown>>;
      calculationSteps?: Array<Record<string, unknown>>;
      comparison?: Record<string, unknown>;
    };
    text(`Outcome: ${result.outcome}. ${result.explanation}`);
    for (const reference of trace.references ?? []) {
      text(`Reference: ${Object.values(reference).filter(Boolean).join(' - ')}`, {
        size: 7.5,
        indent: 8,
      });
    }
    for (const step of trace.calculationSteps ?? []) {
      text(
        `${step.label}: ${step.formula} | ${step.substitutedFormula} = ${step.result} ${step.unit}`,
        { size: 7.5, indent: 8 }
      );
    }
    if (trace.comparison) {
      text(`Decision: ${trace.comparison.substituted ?? trace.comparison.formula}`, {
        size: 7.5,
        indent: 8,
      });
    }
  }

  addPage('Supplement B. Review and Approval');
  keyValues([
    ['Final session status', `${data.session.status} (Administrative Sign-off)`],
    ['Overall technical outcome', overallTechnicalOutcome],
    ['Technician', data.session.technician.name],
    ['Reviewing Officer', data.session.reviewer?.name],
    ['Approving Officer', data.session.approver?.name],
  ]);
  table(
    ['Workflow action', 'Officer', 'Date', 'Comment'],
    data.session.approvals.map((approval) => [
      safeText(approval.action),
      approval.user.name,
      approval.createdAt.slice(0, 10),
      approval.comments ?? 'No comment recorded',
    ]),
    [120, 135, 80, 176]
  );
  text(
    'Human workflow status and technical R76 compliance outcomes are distinct. Approval confirms the authenticity of the persisted evaluation record; it does NOT recalculate regulatory results or grant compliance to a failing instrument.',
    { size: 8 }
  );

  heading('Public report verification', 10);
  const qrBytes = await QRCode.toBuffer(data.verificationUrl, {
    type: 'png',
    errorCorrectionLevel: 'H',
    width: 360,
    margin: 2,
    color: { dark: '#111827', light: '#FFFFFF' },
  });
  const qrImage = await document.embedPng(qrBytes);
  ensure(104);
  page.drawImage(qrImage, { x: MARGIN, y: y - 90, width: 90, height: 90 });
  page.drawText('Scan to verify report', {
    x: MARGIN + 108,
    y: y - 22,
    size: 10,
    font: bold,
    color: rgb(0.06, 0.25, 0.43),
  });
  text(`Report reference: ${data.referenceNumber}`, { size: 8, indent: 108, gap: 1 });
  text(data.verificationUrl, { size: 7, indent: 108, color: rgb(0.35, 0.38, 0.42) });
  y -= 68;

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    const footer = `Page ${index + 1} / ${pages.length}  |  ${data.referenceNumber}`;
    currentPage.drawLine({
      start: { x: MARGIN, y: 34 },
      end: { x: A4[0] - MARGIN, y: 34 },
      thickness: 0.5,
      color: rgb(0.7, 0.72, 0.74),
    });
    currentPage.drawText(footer, {
      x: MARGIN,
      y: 20,
      size: 7,
      font: regular,
      color: rgb(0.4, 0.43, 0.46),
    });
  });

  document.setTitle(`${reportHeaderTitle} ${data.referenceNumber}`);
  document.setSubject(`Approved NAWI test session ${data.session.id}`);
  document.setCreator('NAWI R76 Compliance Testing');
  document.setKeywords(['NAWI', 'OIML R76-2', 'qr-verification-v1']);
  return document.save();
}
