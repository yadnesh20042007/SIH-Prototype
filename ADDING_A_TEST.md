# Adding a New R76 Test Module

> Follow every step in order. Each step is a single, self-contained change.
> Run `vitest run` and `tsc --noEmit` after step 6, and again after step 8.

---

## Architecture overview

```
Instrument config
  └─ test-selection/engine.ts         ← applicability gate (selectTests)
       └─ engine/index.ts              ← orchestrator (evaluateInstrumentCompliance)
            └─ calculations/<test>.ts  ← pure PASS/FAIL formula + ComplianceTrace
                 └─ types/results.ts   ← shared result/trace types (do not change)

Persistence pipeline
  DB: Prisma TestType enum + observationData Json + complianceTrace Json
  service: session-evaluation.service.ts  ← reads DB, builds TestObservations, writes results
  service: result-freshness.service.ts    ← PROTOTYPE_TEST_TYPES registration point

UI pipeline
  components/Evaluation/EvaluationScreen.tsx  ← renders section if isApplicable
  components/Evaluation/result-persistence.ts ← maps engine output to DB payload
  lib/validation/test-observation.ts + test-result.ts  ← API-level validation
```

---

## Step 1 — Prisma schema (`prisma/schema.prisma`)

Add the new stored name to the `TestType` enum:

```prisma
enum TestType {
  WEIGHING_PERFORMANCE
  REPEATABILITY
  ECCENTRIC_LOADING
  DISCRIMINATION      // example — replace with real name
}
```

> `observationData` and `complianceTrace` are `Json`, so no new table or column
> is needed. Only the enum changes.
> Queue the migration: `prisma migrate dev --name add_discrimination_test`
> (Supabase is paused — the file is generated locally; apply when live.)

---

## Step 2 — TypeScript `TestType` enum (`src/lib/r76/types/test.ts`)

```ts
export enum TestType {
  WeighingPerformance = 'weighing_performance',
  Repeatability       = 'repeatability',
  EccentricLoading    = 'eccentric_loading',
  Discrimination      = 'discrimination',   // add
}
```

Add the session interface and extend `R76Test`:

```ts
export interface DiscriminationTest extends BaseTestSession {
  type: TestType.Discrimination;
  observation?: DiscriminationObservation;
  result?: TestComplianceResult;
}

export type R76Test =
  | WeighingPerformanceTest
  | RepeatabilityTest
  | EccentricLoadingTest
  | DiscriminationTest;   // add
```

---

## Step 3 — Observation type (`src/lib/r76/types/observations.ts`)

Add only raw (observed/recorded) values — no derived fields:

```ts
export interface DiscriminationObservation {
  /** Test load in kg (approximately 0.5 x Max). */
  testLoad: number;
  /** Indication before applying the small additional load, in kg. */
  indicationBefore: number;
  /** Indication after applying 1e additional load, in kg. */
  indicationAfter: number;
}
```

Re-export from `src/lib/r76/types/index.ts`:

```ts
export type { DiscriminationObservation } from './observations';
```

---

## Step 4 — Calculation module (`src/lib/r76/calculations/discrimination.ts`)

```ts
import type { DiscriminationObservation } from '../types/observations';
import { TestComplianceResult, TestOutcome } from '../types/results';
import type { ComplianceTrace } from '../types/results';
import { Instrument } from '../types/instrument';
import { VerificationContext } from '../types/verification';

export interface DiscriminationTestResult extends TestComplianceResult {
  trace: ComplianceTrace;
}

/**
 * Evaluates a discrimination test per R76-1 (2006) clause <X>.
 * Replace the body with the actual regulatory calculation.
 */
export function evaluateDiscriminationTest(
  obs: DiscriminationObservation,
  instrument: Instrument,
  context: VerificationContext
): DiscriminationTestResult {
  throw new Error('Not implemented — regulatory formula required.');
}
```

Register in the barrel (`src/lib/r76/calculations/index.ts`):

```ts
export { evaluateDiscriminationTest }    from './discrimination';
export type { DiscriminationTestResult } from './discrimination';
```

---

## Step 5 — Test-selection engine (`src/lib/r76/test-selection/engine.ts`)

Add a block inside `selectTests()` after the existing three:

```ts
// 4. Discrimination
if (!isSingleRange) {
  results.push({
    testType: TestType.Discrimination,
    isApplicable: false,
    reason: 'Unsupported: Only single-range instruments are currently supported.',
    r76Reference: 'OIML R76-1 clause <ref>',
    prerequisites: [],
  });
} else {
  results.push({
    testType: TestType.Discrimination,
    isApplicable: true,
    reason: 'Discrimination test applies to all instruments. (clause <ref>)',
    r76Reference: 'OIML R76-1 clause <ref>',
    prerequisites: [
      'Test load should be approximately 0.5 x Max. (clause <ref>)',
    ],
  });
}
```

---

## Step 6 — Orchestration engine (`src/lib/r76/engine/index.ts`)

**a) Extend `TestObservations`:**

```ts
export interface TestObservations {
  weighingPerformance?: WeighingPerformanceObservation[];
  repeatability?: RepeatabilityObservation;
  eccentricLoading?: EccentricLoadingObservation[];
  eccentricZeroDeterminedBeforeEachLoading?: boolean;
  discrimination?: DiscriminationObservation;    // add
}
```

**b) Add a dispatch branch in the evaluation `for` loop:**

```ts
else if (selection.testType === TestType.Discrimination) {
  if (!observations.discrimination) {
    status = 'incomplete';
  } else {
    result = evaluateDiscriminationTest(observations.discrimination, instrument, context);
  }
}
```

**c) Extend the `EvaluatedTest.result` union type:**

```ts
result?: WeighingPerformanceTestResult | RepeatabilityTestResult
       | EccentricityTestResult | DiscriminationTestResult;
```

Run `vitest run` — all existing tests must still pass. Run `tsc --noEmit`.

---

## Step 7 — DB/persistence layer

**a) `PROTOTYPE_TEST_TYPES` (`src/lib/services/result-freshness.service.ts`)**

```ts
export const PROTOTYPE_TEST_TYPES = [
  'WEIGHING_PERFORMANCE',
  'REPEATABILITY',
  'ECCENTRIC_LOADING',
  'DISCRIMINATION',      // add
] as const;
```

**b) `StoredTestType` + `STORED_TYPE_BY_ENGINE_TYPE` (`src/components/Evaluation/result-persistence.ts`)**

```ts
export type StoredTestType =
  | 'WEIGHING_PERFORMANCE'
  | 'REPEATABILITY'
  | 'ECCENTRIC_LOADING'
  | 'DISCRIMINATION';       // add

export const STORED_TYPE_BY_ENGINE_TYPE: Record<TestType, StoredTestType> = {
  [TestType.WeighingPerformance]: 'WEIGHING_PERFORMANCE',
  [TestType.Repeatability]:       'REPEATABILITY',
  [TestType.EccentricLoading]:    'ECCENTRIC_LOADING',
  [TestType.Discrimination]:      'DISCRIMINATION',     // add
};
```

**c) `toTestResultPersistenceData` — add a trace extraction branch:**

```ts
if (test.testType === TestType.Discrimination) {
  const result = test.result as DiscriminationTestResult;
  return { ...base, mpe: String(result.mpe), complianceTrace: result.trace };
}
```

**d) `engineTypeForStoredType()` — add reverse mapping:**

```ts
if (testType === 'DISCRIMINATION') return TestType.Discrimination;
```

**e) `session-evaluation.service.ts` — add observation extraction:**

```ts
discrimination: dataFor('DISCRIMINATION')[0]
  ? pick(dataFor('DISCRIMINATION')[0], ['testLoad', 'indicationBefore', 'indicationAfter'])
    as unknown as TestObservations['discrimination']
  : undefined,
```

---

## Step 8 — Validation (`src/lib/validation/`)

**`test-observation.ts`** — add `'DISCRIMINATION'` to the allowed types array and a
`validateDiscrimination()` function (mirrors `validateWeighing` / `validateRepeatability`).

**`test-result.ts`** — add `'DISCRIMINATION'` to `TEST_RESULT_TYPES`.

---

## Step 9 — Evaluation UI (`src/components/Evaluation/EvaluationScreen.tsx`)

The screen already reads `applicableTestTypes` from `selectTests`. Add:

```tsx
{applicableTestTypes.has(TestType.Discrimination) ? (
  <DiscriminationSection ... />
) : (
  <NotApplicableBanner
    testName="Discrimination"
    reason={testSelection.find(s => s.testType === TestType.Discrimination)?.reason ?? ''}
    r76Reference={testSelection.find(s => s.testType === TestType.Discrimination)?.r76Reference}
  />
)}
```

Create `DiscriminationSection` following the same structure as
`WeighingPerformanceSection`, `RepeatabilitySection`, and `EccentricLoadingSection`.

---

## Step 10 — Tests

| File | Coverage |
|---|---|
| `calculations/discrimination.test.ts` | Pass / fail / boundary cases for the pure function |
| `test-selection/engine.test.ts` | New applicability cases |
| `test-selection/selection-integration.test.ts` | Assert correct applicable set for new fixture |
| `components/Evaluation/result-persistence.test.ts` | `toTestResultPersistenceData` for new type |

Run `vitest run` — all tests must pass. `tsc --noEmit` must show 0 errors.

---

## Complete file checklist

| # | File | What changes |
|---|---|---|
| 1 | `prisma/schema.prisma` | Add enum value; queue migration |
| 2 | `src/lib/r76/types/test.ts` | Add `TestType` value + session interface + union |
| 3 | `src/lib/r76/types/observations.ts` | Add observation interface |
| 4 | `src/lib/r76/types/index.ts` | Re-export new observation type |
| 5 | `src/lib/r76/calculations/<test>.ts` | New pure calculation module |
| 6 | `src/lib/r76/calculations/index.ts` | Register in barrel |
| 7 | `src/lib/r76/test-selection/engine.ts` | Add applicability block |
| 8 | `src/lib/r76/engine/index.ts` | Extend `TestObservations` + dispatch |
| 9 | `src/lib/services/result-freshness.service.ts` | Add to `PROTOTYPE_TEST_TYPES` |
| 10 | `src/components/Evaluation/result-persistence.ts` | `StoredTestType`, mapping, trace branch |
| 11 | `src/lib/services/session-evaluation.service.ts` | Observation extraction block |
| 12 | `src/lib/validation/test-observation.ts` | Add type + validate function |
| 13 | `src/lib/validation/test-result.ts` | Add type |
| 14 | `src/components/Evaluation/EvaluationScreen.tsx` | New section + conditional render |
| 15 | Test files | Coverage for all new code |

**Total: 15 files, 0 new dependencies, 0 new DB tables or columns.**
