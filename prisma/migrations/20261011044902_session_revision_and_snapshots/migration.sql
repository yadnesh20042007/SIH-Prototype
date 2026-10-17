-- AlterEnum
ALTER TYPE "ApprovalAction" ADD VALUE 'RETURN';

-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "approvals" ADD COLUMN     "sessionRevision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "test_sessions" ADD COLUMN     "revisionNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "test_session_snapshots" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "observationsData" JSONB NOT NULL,
    "resultsData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_session_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_session_snapshots_sessionId_revisionNumber_key" ON "test_session_snapshots"("sessionId", "revisionNumber");

-- AddForeignKey
ALTER TABLE "test_session_snapshots" ADD CONSTRAINT "test_session_snapshots_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
