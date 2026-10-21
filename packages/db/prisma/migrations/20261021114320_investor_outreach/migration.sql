-- CreateEnum
CREATE TYPE "InvestorEmailStatus" AS ENUM ('DRAFT', 'SENT', 'SKIPPED', 'CANCELLED');

-- AlterTable
ALTER TABLE "fundraise" ADD COLUMN     "dailySendLimit" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "investor" ADD COLUMN     "contactedAt" TIMESTAMP(3),
ADD COLUMN     "repliedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "investorEmail" (
    "id" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "InvestorEmailStatus" NOT NULL DEFAULT 'DRAFT',
    "toEmail" TEXT,
    "senderUserId" TEXT,
    "gmailMessageId" TEXT,
    "gmailThreadId" TEXT,
    "rfcMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investorEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investorEmail_investorId_step_idx" ON "investorEmail"("investorId", "step");

-- CreateIndex
CREATE INDEX "investorEmail_gmailThreadId_idx" ON "investorEmail"("gmailThreadId");

-- CreateIndex
CREATE INDEX "investorEmail_status_sentAt_idx" ON "investorEmail"("status", "sentAt");

-- AddForeignKey
ALTER TABLE "investorEmail" ADD CONSTRAINT "investorEmail_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investorEmail" ADD CONSTRAINT "investorEmail_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
