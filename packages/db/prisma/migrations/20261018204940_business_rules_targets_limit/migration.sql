-- CreateEnum
CREATE TYPE "BusinessRuleKind" AS ENUM ('EMAIL_DOMAIN', 'MAILBOX');

-- AlterEnum
ALTER TYPE "BusinessFilingSource" ADD VALUE 'RULE';

-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "businessFilingDailyLimit" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "business" ADD COLUMN     "monthlyTarget" DECIMAL(14,2),
ADD COLUMN     "monthlyTargetCurrency" TEXT;

-- CreateTable
CREATE TABLE "businessRule" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "BusinessRuleKind" NOT NULL,
    "value" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "businessRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "businessRule_kind_value_idx" ON "businessRule"("kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "businessRule_businessId_kind_value_key" ON "businessRule"("businessId", "kind", "value");

-- AddForeignKey
ALTER TABLE "businessRule" ADD CONSTRAINT "businessRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessRule" ADD CONSTRAINT "businessRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
