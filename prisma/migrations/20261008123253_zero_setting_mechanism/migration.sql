-- CreateEnum
CREATE TYPE "ZeroSettingMechanism" AS ENUM ('NON_AUTOMATIC', 'SEMI_AUTOMATIC', 'AUTOMATIC', 'ZERO_TRACKING');

-- AlterEnum
ALTER TYPE "TestType" ADD VALUE 'ZERO_SETTING_ACCURACY';

-- AlterTable
ALTER TABLE "instruments" ADD COLUMN     "zeroSettingMechanisms" "ZeroSettingMechanism"[] DEFAULT ARRAY[]::"ZeroSettingMechanism"[];
