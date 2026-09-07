-- Nullable values deliberately leave legacy results uncertified until explicit evaluation.
ALTER TABLE "test_observations" ADD COLUMN "observationFingerprint" TEXT;
ALTER TABLE "test_results" ADD COLUMN "evaluatedObservationFingerprint" TEXT;
