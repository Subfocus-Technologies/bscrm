-- AlterTable
ALTER TABLE "deal" ADD COLUMN     "businessId" TEXT;

-- CreateTable
CREATE TABLE "business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businessPosition" (
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "businessPosition_pkey" PRIMARY KEY ("userId","businessId")
);

-- CreateTable
CREATE TABLE "businessFocus" (
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businessFocus_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "companyBusiness" (
    "companyId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companyBusiness_pkey" PRIMARY KEY ("companyId","businessId")
);

-- CreateTable
CREATE TABLE "contactBusiness" (
    "contactId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contactBusiness_pkey" PRIMARY KEY ("contactId","businessId")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_name_key" ON "business"("name");

-- CreateIndex
CREATE INDEX "businessPosition_userId_position_idx" ON "businessPosition"("userId", "position");

-- CreateIndex
CREATE INDEX "businessFocus_businessId_idx" ON "businessFocus"("businessId");

-- CreateIndex
CREATE INDEX "companyBusiness_businessId_companyId_idx" ON "companyBusiness"("businessId", "companyId");

-- CreateIndex
CREATE INDEX "contactBusiness_businessId_contactId_idx" ON "contactBusiness"("businessId", "contactId");

-- CreateIndex
CREATE INDEX "deal_businessId_idx" ON "deal"("businessId");

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business" ADD CONSTRAINT "business_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business" ADD CONSTRAINT "business_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessPosition" ADD CONSTRAINT "businessPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessPosition" ADD CONSTRAINT "businessPosition_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessFocus" ADD CONSTRAINT "businessFocus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessFocus" ADD CONSTRAINT "businessFocus_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyBusiness" ADD CONSTRAINT "companyBusiness_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyBusiness" ADD CONSTRAINT "companyBusiness_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyBusiness" ADD CONSTRAINT "companyBusiness_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactBusiness" ADD CONSTRAINT "contactBusiness_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactBusiness" ADD CONSTRAINT "contactBusiness_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactBusiness" ADD CONSTRAINT "contactBusiness_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
