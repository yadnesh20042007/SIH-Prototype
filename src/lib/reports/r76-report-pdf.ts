import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';

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

  function addPage(title?: string): void {
    page = document.addPage(A4);
    y = A4[1] - MARGIN;
    page.drawText('OIML R 76-2:2007-aligned Type Evaluation Report', { x: MARGIN, y, size: 8, font: bold, color: rgb(0.12, 0.18, 0.24) });
    page.drawText(data.referenceNumber, { x: A4[0] - MARGIN - regular.widthOfTextAtSize(data.referenceNumber, 8), y, size: 8, font: regular, color: rgb(0.35, 0.4, 0.45) });
    y -= 16;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.7, color: rgb(0.55, 0.6, 0.65) });
    y -= 22;
    if (title) heading(title, 15);
  }

  function ensure(height: number): void {
    if (y - height < 48) addPage();
  }

  function text(value: string, options: { size?: number; font?: PDFFont; indent?: number; gap?: number; color?: ReturnType<typeof rgb> } = {}): void {
    const size = options.size ?? 8.5;
    const font = options.font ?? regular;
    const indent = options.indent ?? 0;
    const lines = wrap(value, font, size, CONTENT_WIDTH - indent);
    ensure(lines.length * (size + 3));
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + indent, y, size, font, color: options.color ?? rgb(0.12, 0.14, 0.16) });
      y -= size + 3;
    }
    y -= options.gap ?? 3;
  }

  function heading(value: string, size = 12): void {
    ensure(size + 18);
    page.drawText(safeText(value), { x: MARGIN, y, size, font: bold, color: rgb(0.06, 0.25, 0.43) });
    y -= size + 5;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.6, color: rgb(0.65, 0.75, 0.83) });
    y -= 10;
  }

  function keyValues(items: Array<[string, unknown]>): void {
    for (const [key, value] of items) {
      ensure(18);
      page.drawText(safeText(key), { x: MARGIN, y, size: 8, font: bold, color: rgb(0.25, 0.29, 0.33) });
      const rendered = value === null || value === undefined || value === '' ? 'Not recorded' : safeText(value);
      const lines = wrap(rendered, regular, 8, CONTENT_WIDTH - 165);
      lines.forEach((line, index) => page.drawText(line, { x: MARGIN + 165, y: y - index * 11, size: 8, font: regular }));
      y -= Math.max(15, lines.length * 11 + 3);
    }
    y -= 4;
  }

  function table(headers: string[], rows: string[][], widths: number[]): void {
    const rowHeight = 21;
    const drawRow = (cells: string[], isHeader: boolean) => {
      ensure(rowHeight);
      let x = MARGIN;
      cells.forEach((cell, index) => {
        page.drawRectangle({ x, y: y - rowHeight + 5, width: widths[index], height: rowHeight, borderWidth: 0.5, borderColor: rgb(0.65, 0.68, 0.72), color: isHeader ? rgb(0.93, 0.95, 0.97) : rgb(1, 1, 1) });
        const clipped = safeText(cell).length > 52 ? `${safeText(cell).slice(0, 49)}...` : safeText(cell);
        page.drawText(clipped, { x: x + 4, y: y - 9, size: isHeader ? 7.2 : 7, font: isHeader ? bold : regular });
        x += widths[index];
      });
      y -= rowHeight;
    };
    drawRow(headers, true);
    rows.forEach(row => drawRow(row, false));
    y -= 10;
  }

  const instrument = data.session.instrument;
  addPage('1. General Information concerning the Type');
  text('This report is aligned to the applicable forms in OIML R 76-2:2007. It is generated by the laboratory application and is not issued or endorsed by OIML.', { size: 8, color: rgb(0.35, 0.38, 0.42), gap: 9 });
  keyValues([
    ['Report / application reference', data.referenceNumber],
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
    ['Initial zero-setting device', instrument.hasInitialZeroSettingDevice ? 'Fitted' : 'Not fitted'],
    ['Initial zero-setting range', instrument.initialZeroSettingRange],
    ['Fine display device', instrument.hasFineDisplayDevice ? 'Fitted' : 'Not fitted'],
    ['Verification context', instrument ? data.session.verificationContext : 'Not recorded'],
    ['Ruleset version', `${data.session.rulesetVersion.standard}:${data.session.rulesetVersion.version}`],
    ['Evaluation period', `${data.session.createdAt} to ${data.session.completedAt ?? 'Not recorded'}`],
    ['Report date', data.issuedAt],
    ['Observer / technician', data.session.technician.name],
    ['Session reference', data.session.id],
    ['Environment / equipment / applicant', 'Not recorded'],
  ]);

  addPage('2. Summary of Type Evaluation');
  text('This generated report contains the OIML R 76-2 sections supported by the currently implemented test modules.', { gap: 10 });
  const resultOrder = ['WEIGHING_PERFORMANCE', 'ECCENTRIC_LOADING', 'REPEATABILITY'];
  const resultName: Record<string, string> = { WEIGHING_PERFORMANCE: 'Weighing Performance', ECCENTRIC_LOADING: 'Eccentricity using weights', REPEATABILITY: 'Repeatability' };
  const formRef: Record<string, string> = { WEIGHING_PERFORMANCE: '1', ECCENTRIC_LOADING: '3.1', REPEATABILITY: '5' };
  table(['Test', 'R76-2', 'Result', 'Remarks'], resultOrder.map(type => {
    const result = data.session.results.find(item => item.testType === type)!;
    return [resultName[type], formRef[type], result.outcome, result.r76Reference];
  }), [180, 55, 75, 201]);
  const outcomes = data.session.results.map(result => result.outcome);
  const overall = outcomes.includes('FAIL') ? 'FAIL' : outcomes.includes('REQUIRES_RETEST') ? 'REQUIRES_RETEST' : 'PASS';
  keyValues([['Overall persisted technical result', overall], ['Human approval status', data.session.status]]);
  text('Unsupported R76-2 test forms are not represented as completed or passed in this report.', { size: 8, color: rgb(0.35, 0.38, 0.42) });

  for (const type of resultOrder) {
    const result = data.session.results.find(item => item.testType === type)!;
    const observations = data.session.observations.filter(item => item.testType === type).sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    addPage(`${formRef[type]}. ${resultName[type]}`);
    text(`Persisted test outcome: ${result.outcome}`, { font: bold });
    text(result.explanation);
    if (type === 'WEIGHING_PERFORMANCE') {
      const trace = result.complianceTrace as { calculationSteps?: Array<{ label?: string; result?: unknown }>; comparison?: { substituted?: string } };
      const step = (name: string) => trace.calculationSteps?.find(item => item.label?.toLowerCase().includes(name))?.result;
      table(['L kg', 'I kg', 'Delta L kg', 'E kg', 'Ec kg', 'MPE kg', 'Result'], observations.map((item, index) => {
        const o = item.observationData;
        const traceRow = index === 0;
        return [String(o.load), String(o.indicatedValue), String(o.additionalLoad ?? 0), traceRow ? String(step('error before') ?? 'Not recorded') : 'Not recorded', traceRow ? String(step('corrected') ?? 'Not recorded') : 'Not recorded', traceRow ? result.mpe : 'See persisted result', traceRow ? result.outcome : 'See summary'];
      }), [56, 56, 67, 56, 56, 67, 80]);
    } else if (type === 'ECCENTRIC_LOADING') {
      const trace = result.complianceTrace as { calculationSteps?: Array<{ label?: string; result?: unknown }> };
      const step = (name: string) => trace.calculationSteps?.find(item => item.label?.toLowerCase().includes(name))?.result;
      table(['Position', 'L kg', 'I kg', 'Delta L', 'E kg', 'Ec kg', 'Result'], observations.map((item, index) => {
        const o = item.observationData;
        return [String(o.positionId), String(o.appliedLoad), String(o.indicatedValue), String(o.additionalLoad ?? 0), index === 0 ? String(step('error before') ?? 'Not recorded') : 'Not recorded', index === 0 ? String(step('corrected') ?? 'Not recorded') : 'Not recorded', index === 0 ? result.outcome : 'See summary'];
      }), [75, 65, 65, 65, 65, 65, 111]);
    } else {
      const observation = observations[0]?.observationData;
      const indications = Array.isArray(observation?.indications) ? observation.indications : [];
      table(['Run', 'Load kg', 'Indication I kg', 'Per-run error'], indications.map((indication, index) => [String(index + 1), String(observation?.testLoad ?? 'Not recorded'), String(indication), 'Not recorded']), [65, 120, 150, 176]);
      keyValues([['Emax - Emin / repeatability range', result.repeatabilityRange], ['Applicable MPE', `${result.mpe} kg`], ['Result', result.outcome]]);
    }
    keyValues([['Persisted R76 reference', result.r76Reference], ['Maximum absolute error', `${result.maxAbsoluteError} kg`], ['MPE', `${result.mpe} kg`]]);
  }

  addPage('Supplement A. Software-generated Compliance Trace');
  text('This supplementary traceability section is generated by the application from persisted engine output. It is not an original OIML R 76-2 form.', { gap: 10 });
  for (const result of data.session.results) {
    heading(resultName[result.testType], 10);
    const trace = result.complianceTrace as { references?: Array<Record<string, unknown>>; calculationSteps?: Array<Record<string, unknown>>; comparison?: Record<string, unknown> };
    text(`Outcome: ${result.outcome}. ${result.explanation}`);
    for (const reference of trace.references ?? []) text(`Reference: ${Object.values(reference).filter(Boolean).join(' - ')}`, { size: 7.5, indent: 8 });
    for (const step of trace.calculationSteps ?? []) text(`${step.label}: ${step.formula} | ${step.substitutedFormula} = ${step.result} ${step.unit}`, { size: 7.5, indent: 8 });
    if (trace.comparison) text(`Decision: ${trace.comparison.substituted ?? trace.comparison.formula}`, { size: 7.5, indent: 8 });
  }

  addPage('Supplement B. Review and Approval');
  keyValues([
    ['Final session status', data.session.status],
    ['Technician', data.session.technician.name],
    ['Reviewing Officer', data.session.reviewer?.name],
    ['Approving Officer', data.session.approver?.name],
  ]);
  table(['Workflow action', 'Officer', 'Date', 'Comment'], data.session.approvals.map(approval => [safeText(approval.action), approval.user.name, approval.createdAt.slice(0, 10), approval.comments ?? 'No comment recorded']), [120, 135, 80, 176]);
  text('Human workflow status and technical R76 compliance outcomes are distinct. Approval confirms the persisted evaluation record; it does not recalculate the regulatory result.', { size: 8 });

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
  page.drawText('Scan to verify report', { x: MARGIN + 108, y: y - 22, size: 10, font: bold, color: rgb(0.06, 0.25, 0.43) });
  text(`Report reference: ${data.referenceNumber}`, { size: 8, indent: 108, gap: 1 });
  text(data.verificationUrl, { size: 7, indent: 108, color: rgb(0.35, 0.38, 0.42) });
  y -= 68;

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    const footer = `Page ${index + 1} / ${pages.length}  |  ${data.referenceNumber}`;
    currentPage.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: A4[0] - MARGIN, y: 34 }, thickness: 0.5, color: rgb(0.7, 0.72, 0.74) });
    currentPage.drawText(footer, { x: MARGIN, y: 20, size: 7, font: regular, color: rgb(0.4, 0.43, 0.46) });
  });

  document.setTitle(`OIML R 76-2:2007-aligned Type Evaluation Report ${data.referenceNumber}`);
  document.setSubject(`Approved NAWI test session ${data.session.id}`);
  document.setCreator('NAWI R76 Compliance Testing');
  document.setKeywords(['NAWI', 'OIML R76-2', 'qr-verification-v1']);
  return document.save();
}
