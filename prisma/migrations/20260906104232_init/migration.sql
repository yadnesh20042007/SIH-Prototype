-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LAB_TECHNICIAN', 'REVIEWING_OFFICER', 'APPROVING_OFFICER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccuracyClass" AS ENUM ('I', 'II', 'III', 'IIII');

-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('SINGLE_RANGE', 'MULTI_RANGE', 'MULTI_INTERVAL');

-- CreateEnum
CREATE TYPE "VerificationContext" AS ENUM ('INITIAL_VERIFICATION', 'SUBSEQUENT_VERIFICATION', 'SERVICE_INSPECTION');

-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('WEIGHING_PERFORMANCE', 'REPEATABILITY', 'ECCENTRIC_LOADING');

-- CreateEnum
CREATE TYPE "TestOutcome" AS ENUM ('PASS', 'FAIL', 'REQUIRES_RETEST');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('SUBMIT_FOR_REVIEW', 'REVIEW_APPROVE', 'REVIEW_REJECT', 'FINAL_APPROVE', 'FINAL_REJECT', 'CANCEL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SUBMIT', 'APPROVE', 'REJECT', 'CANCEL', 'GENERATE_REPORT', 'LOGIN', 'LOGOUT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ruleset_versions" (
    "id" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ruleset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "registrationCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT,
    "accuracyClass" "AccuracyClass" NOT NULL,
    "instrumentType" "InstrumentType" NOT NULL DEFAULT 'SINGLE_RANGE',
    "max" DECIMAL(18,6) NOT NULL,
    "min" DECIMAL(18,6) NOT NULL,
    "e" DECIMAL(18,8) NOT NULL,
    "d" DECIMAL(18,8) NOT NULL,
    "numberOfSupportPoints" INTEGER NOT NULL DEFAULT 4,
    "additiveTareEffect" BOOLEAN NOT NULL DEFAULT false,
    "hasAutoZeroOrTracking" BOOLEAN NOT NULL DEFAULT false,
    "hasInitialZeroSettingDevice" BOOLEAN NOT NULL DEFAULT false,
    "initialZeroSettingRange" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "hasFineDisplayDevice" BOOLEAN NOT NULL DEFAULT false,
    "registeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_sessions" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "verificationContext" "VerificationContext" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "rulesetVersionId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "approverId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "test_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_observations" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "testType" "TestType" NOT NULL,
    "sequenceIndex" INTEGER NOT NULL DEFAULT 0,
    "observationData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_results" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "testType" "TestType" NOT NULL,
    "outcome" "TestOutcome" NOT NULL,
    "maxAbsoluteError" DECIMAL(18,8) NOT NULL,
    "mpe" DECIMAL(18,8) NOT NULL,
    "repeatabilityRange" DECIMAL(18,8),
    "r76Reference" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "rulesetVersionId" TEXT NOT NULL,
    "complianceTrace" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "humanReadablePath" TEXT,
    "machineReadablePath" TEXT,
    "digitalSignatureMetadata" JSONB,
    "qrVerificationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ruleset_versions_standard_version_key" ON "ruleset_versions"("standard", "version");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_registrationCode_key" ON "manufacturers"("registrationCode");

-- CreateIndex
CREATE INDEX "instruments_manufacturerId_idx" ON "instruments"("manufacturerId");

-- CreateIndex
CREATE INDEX "test_sessions_instrumentId_idx" ON "test_sessions"("instrumentId");

-- CreateIndex
CREATE INDEX "test_sessions_technicianId_idx" ON "test_sessions"("technicianId");

-- CreateIndex
CREATE INDEX "test_sessions_reviewerId_idx" ON "test_sessions"("reviewerId");

-- CreateIndex
CREATE INDEX "test_sessions_approverId_idx" ON "test_sessions"("approverId");

-- CreateIndex
CREATE INDEX "test_sessions_status_idx" ON "test_sessions"("status");

-- CreateIndex
CREATE INDEX "test_observations_sessionId_testType_idx" ON "test_observations"("sessionId", "testType");

-- CreateIndex
CREATE INDEX "test_results_sessionId_testType_idx" ON "test_results"("sessionId", "testType");

-- CreateIndex
CREATE INDEX "approvals_sessionId_idx" ON "approvals"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_referenceNumber_key" ON "reports"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "reports_qrVerificationId_key" ON "reports"("qrVerificationId");

-- CreateIndex
CREATE INDEX "reports_sessionId_idx" ON "reports"("sessionId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_rulesetVersionId_fkey" FOREIGN KEY ("rulesetVersionId") REFERENCES "ruleset_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_observations" ADD CONSTRAINT "test_observations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_rulesetVersionId_fkey" FOREIGN KEY ("rulesetVersionId") REFERENCES "ruleset_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
