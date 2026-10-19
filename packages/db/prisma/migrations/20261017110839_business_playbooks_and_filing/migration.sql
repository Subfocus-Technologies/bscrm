-- CreateEnum
CREATE TYPE "BusinessFilingSource" AS ENUM ('MANUAL', 'AGENT');

-- CreateEnum
CREATE TYPE "BusinessSuggestionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DISMISSED');

-- AlterTable
ALTER TABLE "business" ADD COLUMN     "playbook" TEXT;

-- AlterTable
ALTER TABLE "companyBusiness" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "source" "BusinessFilingSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "contactBusiness" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "source" "BusinessFilingSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "businessSuggestion" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "status" "BusinessSuggestionStatus" NOT NULL DEFAULT 'PROPOSED',
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businessSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "businessSuggestion_status_createdAt_idx" ON "businessSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "businessSuggestion_companyId_idx" ON "businessSuggestion"("companyId");

-- CreateIndex
CREATE INDEX "businessSuggestion_contactId_idx" ON "businessSuggestion"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "businessSuggestion_businessId_companyId_key" ON "businessSuggestion"("businessId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "businessSuggestion_businessId_contactId_key" ON "businessSuggestion"("businessId", "contactId");

-- AddForeignKey
ALTER TABLE "businessSuggestion" ADD CONSTRAINT "businessSuggestion_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessSuggestion" ADD CONSTRAINT "businessSuggestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessSuggestion" ADD CONSTRAINT "businessSuggestion_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessSuggestion" ADD CONSTRAINT "businessSuggestion_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
