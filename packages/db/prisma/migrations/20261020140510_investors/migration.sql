-- CreateEnum
CREATE TYPE "InvestorKind" AS ENUM ('ANGEL', 'ANGEL_GROUP', 'VC', 'FAMILY_OFFICE', 'CORPORATE_VC', 'ACCELERATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "InvestorStage" AS ENUM ('TO_APPROVE', 'APPROVED', 'CONTACTED', 'REPLIED', 'MEETING', 'COMMITTED', 'PASSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvestorSource" AS ENUM ('IMPORT', 'AGENT', 'MANUAL');

-- CreateTable
CREATE TABLE "fundraise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "summary" TEXT,
    "whyNow" TEXT,
    "traction" TEXT,
    "website" TEXT,
    "founderLinkedIn" TEXT,
    "roundSize" DECIMAL(14,2),
    "roundCurrency" TEXT NOT NULL DEFAULT 'GBP',
    "profile" JSONB NOT NULL,
    "researchDailyLimit" INTEGER NOT NULL DEFAULT 40,
    "autoDiscover" BOOLEAN NOT NULL DEFAULT true,
    "weeklyMeetingTarget" INTEGER NOT NULL DEFAULT 5,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fundraise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor" (
    "id" TEXT NOT NULL,
    "fundraiseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "InvestorKind" NOT NULL DEFAULT 'OTHER',
    "firm" TEXT,
    "website" TEXT,
    "linkedinUrl" TEXT,
    "email" TEXT,
    "location" TEXT,
    "stages" TEXT[],
    "sectors" TEXT[],
    "chequeMin" DECIMAL(14,2),
    "chequeMax" DECIMAL(14,2),
    "chequeCurrency" TEXT NOT NULL DEFAULT 'GBP',
    "thesis" TEXT,
    "notes" TEXT,
    "source" "InvestorSource" NOT NULL,
    "sourceDetail" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "stage" "InvestorStage" NOT NULL DEFAULT 'TO_APPROVE',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageChangedById" TEXT,
    "fitScore" INTEGER,
    "fit" JSONB,
    "researchedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investor_fundraiseId_stage_fitScore_idx" ON "investor"("fundraiseId", "stage", "fitScore");

-- CreateIndex
CREATE UNIQUE INDEX "investor_fundraiseId_dedupeKey_key" ON "investor"("fundraiseId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "fundraise" ADD CONSTRAINT "fundraise_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fundraise" ADD CONSTRAINT "fundraise_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor" ADD CONSTRAINT "investor_fundraiseId_fkey" FOREIGN KEY ("fundraiseId") REFERENCES "fundraise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor" ADD CONSTRAINT "investor_stageChangedById_fkey" FOREIGN KEY ("stageChangedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor" ADD CONSTRAINT "investor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
