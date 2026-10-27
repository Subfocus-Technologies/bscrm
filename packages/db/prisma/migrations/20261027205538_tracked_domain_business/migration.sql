-- AlterTable
ALTER TABLE "trackedDomain" ADD COLUMN     "businessId" TEXT;

-- CreateIndex
CREATE INDEX "trackedDomain_businessId_idx" ON "trackedDomain"("businessId");

-- AddForeignKey
ALTER TABLE "trackedDomain" ADD CONSTRAINT "trackedDomain_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
