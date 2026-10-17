-- CreateEnum
CREATE TYPE "IndicationType" AS ENUM ('DIGITAL', 'ANALOG');

-- AlterEnum
ALTER TYPE "VerificationContext" ADD VALUE 'TYPE_EVALUATION';

-- AlterEnum
ALTER TYPE "TestType" ADD VALUE 'DISCRIMINATION';

-- AlterTable
ALTER TABLE "instruments" ADD COLUMN "indicationType" "IndicationType";
