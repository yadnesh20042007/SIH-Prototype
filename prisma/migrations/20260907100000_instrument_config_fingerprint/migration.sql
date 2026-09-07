-- Adds a nullable column to TestResult that records the SHA-256 fingerprint of the
-- evaluation-relevant instrument configuration at the time the result was produced.
-- Nullable deliberately leaves existing results uncertified (treated as STALE) until
-- re-evaluated with the new server-side fingerprinting logic.
ALTER TABLE "test_results" ADD COLUMN "evaluatedConfigFingerprint" TEXT;
