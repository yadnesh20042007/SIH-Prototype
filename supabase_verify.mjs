/**
 * Supabase freshness verification script (inline, run from project dir).
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(',')}}`;
  }
  throw new Error('non-JSON');
}

function instrumentConfigFingerprint(instrument, verificationContext) {
  const snap = {
    accuracyClass: instrument.accuracyClass,
    instrumentType: instrument.instrumentType,
    max: instrument.max.toString(),
    min: instrument.min.toString(),
    e: instrument.e.toString(),
    d: instrument.d.toString(),
    numberOfSupportPoints: instrument.numberOfSupportPoints,
    additiveTareEffect: instrument.additiveTareEffect,
    hasAutoZeroOrTracking: instrument.hasAutoZeroOrTracking,
    hasInitialZeroSettingDevice: instrument.hasInitialZeroSettingDevice,
    initialZeroSettingRange: instrument.initialZeroSettingRange.toString(),
    hasFineDisplayDevice: instrument.hasFineDisplayDevice,
    verificationContext,
  };
  return createHash('sha256').update(canonicalJson(snap)).digest('hex');
}

function logicalObservationFingerprint(rows) {
  const sorted = [...rows].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  const data = sorted.map(r => ({ sequenceIndex: r.sequenceIndex, observationData: r.observationData }));
  return createHash('sha256').update(canonicalJson(data)).digest('hex');
}

function assessFreshnessForType(observations, results, testType, rulesetVersionId, currentConfigFp) {
  const rows = observations.filter(r => r.testType === testType);
  const matches = results.filter(r => r.testType === testType);
  if (matches.length > 1) return 'CONFLICT';
  if (matches.length === 0 || rows.length === 0) return 'MISSING';
  const result = matches[0];
  const obsFp = logicalObservationFingerprint(rows);
  const obsStale = result.rulesetVersionId !== rulesetVersionId ||
    !result.evaluatedObservationFingerprint ||
    result.evaluatedObservationFingerprint !== obsFp;
  const cfgStale = !result.evaluatedConfigFingerprint ||
    result.evaluatedConfigFingerprint !== currentConfigFp;
  return (obsStale || cfgStale) ? 'STALE' : 'CURRENT';
}

const TEST_TYPES = ['WEIGHING_PERFORMANCE', 'REPEATABILITY', 'ECCENTRIC_LOADING'];

async function main() {
  console.log('\n=== Supabase Configuration Fingerprint Freshness Verification ===\n');

  const session = await prisma.testSession.findFirst({
    where: { status: 'IN_PROGRESS' },
    include: { instrument: true },
    orderBy: { createdAt: 'asc' },
  }) ?? await prisma.testSession.findFirst({
    include: { instrument: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!session) {
    console.log('No sessions found in the database.');
    return;
  }
  const { instrument } = session;

  console.log(`Session: ${session.id} (${session.status})`);
  console.log(`Instrument: accuracyClass=${instrument.accuracyClass}, e=${instrument.e}, max=${instrument.max}, verCtx=${session.verificationContext}`);

  const [observations, results] = await Promise.all([
    prisma.testObservation.findMany({ where: { sessionId: session.id } }),
    prisma.testResult.findMany({ where: { sessionId: session.id } }),
  ]);

  const currentConfigFp = instrumentConfigFingerprint(instrument, session.verificationContext);
  console.log(`\nCurrent config FP: ${currentConfigFp}`);

  console.log('\n-- Step 1: Current freshness --');
  for (const tt of TEST_TYPES) {
    const st = assessFreshnessForType(observations, results, tt, session.rulesetVersionId, currentConfigFp);
    const res = results.find(r => r.testType === tt);
    const storedCfp = res?.evaluatedConfigFingerprint;
    console.log(`  ${tt}: ${st} | stored_cfp_match=${storedCfp === currentConfigFp}`);
  }

  console.log('\n-- Step 2: Changed e (config-only change) → STALE --');
  const changedEVal = (Number(instrument.e.toString()) + 0.001).toString();
  const altInstrE = { ...instrument, e: { toString: () => changedEVal } };
  const changedEFp = instrumentConfigFingerprint(altInstrE, session.verificationContext);
  console.log(`  Changed e FP differs: ${changedEFp !== currentConfigFp}`);
  for (const tt of TEST_TYPES) {
    console.log(`  ${tt}: ${assessFreshnessForType(observations, results, tt, session.rulesetVersionId, changedEFp)}`);
  }

  console.log('\n-- Step 3: Changed accuracyClass → STALE --');
  const allClasses = ['I', 'II', 'III', 'IIII'];
  const altClass = allClasses.find(c => c !== instrument.accuracyClass);
  const altInstrClass = { ...instrument, accuracyClass: altClass };
  const changedClassFp = instrumentConfigFingerprint(altInstrClass, session.verificationContext);
  console.log(`  Changed class FP differs: ${changedClassFp !== currentConfigFp}`);
  for (const tt of TEST_TYPES) {
    console.log(`  ${tt}: ${assessFreshnessForType(observations, results, tt, session.rulesetVersionId, changedClassFp)}`);
  }

  console.log('\n-- Step 4: Changed verificationContext → STALE --');
  const altCtx = session.verificationContext === 'INITIAL_VERIFICATION' ? 'SUBSEQUENT_VERIFICATION' : 'INITIAL_VERIFICATION';
  const changedCtxFp = instrumentConfigFingerprint(instrument, altCtx);
  console.log(`  Changed ctx FP differs: ${changedCtxFp !== currentConfigFp}`);
  for (const tt of TEST_TYPES) {
    console.log(`  ${tt}: ${assessFreshnessForType(observations, results, tt, session.rulesetVersionId, changedCtxFp)}`);
  }

  console.log('\n-- Step 5: Display-only metadata (model/serial) unchanged FP → CURRENT --');
  // Display-only fields are NOT in instrumentConfigFingerprint, so changing them doesn't change FP
  console.log('  Display-only fields not included in fingerprint — same FP as current');
  for (const tt of TEST_TYPES) {
    console.log(`  ${tt}: ${assessFreshnessForType(observations, results, tt, session.rulesetVersionId, currentConfigFp)}`);
  }

  console.log('\n-- Step 6: Null evaluatedConfigFingerprint (legacy result) → STALE --');
  const legacyResults = results.map(r => ({ ...r, evaluatedConfigFingerprint: null }));
  for (const tt of TEST_TYPES) {
    console.log(`  ${tt}: ${assessFreshnessForType(observations, legacyResults, tt, session.rulesetVersionId, currentConfigFp)}`);
  }

  console.log('\n-- Step 7: DB evaluatedConfigFingerprint integrity --');
  let allCurrent = true;
  for (const tt of TEST_TYPES) {
    const res = results.find(r => r.testType === tt);
    if (!res) { console.log(`  ${tt}: NO RESULT`); allCurrent = false; continue; }
    const ok = res.evaluatedConfigFingerprint === currentConfigFp;
    console.log(`  ${tt}: ok=${ok} stored=${res.evaluatedConfigFingerprint?.slice(0,16) ?? 'null'}`);
    if (!ok) allCurrent = false;
  }
  console.log(`\n  Final session freshness state: ${allCurrent ? '✓ ALL CURRENT' : '⚠ NOT ALL CURRENT'}`);
  console.log('\n=== Done ===\n');
}

main()
  .catch(e => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
