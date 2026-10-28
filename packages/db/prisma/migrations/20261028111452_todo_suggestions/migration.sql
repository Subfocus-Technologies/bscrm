-- CreateEnum
CREATE TYPE "TodoSuggestionKind" AS ENUM ('REPLY', 'TODO');

-- CreateEnum
CREATE TYPE "TodoSuggestionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DONE', 'IGNORED');

-- CreateEnum
CREATE TYPE "EmailReplyStatus" AS ENUM ('DRAFT', 'SENT', 'DISCARDED');

-- CreateTable
CREATE TABLE "todoSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "TodoSuggestionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "dueAt" TIMESTAMP(3),
    "quote" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "emailThreadId" TEXT,
    "calendarEventId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "status" "TodoSuggestionStatus" NOT NULL DEFAULT 'PROPOSED',
    "taskId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todoSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emailReply" (
    "id" TEXT NOT NULL,
    "emailThreadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "EmailReplyStatus" NOT NULL DEFAULT 'DRAFT',
    "gmailMessageId" TEXT,
    "rfcMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emailReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "todoSuggestion_taskId_key" ON "todoSuggestion"("taskId");

-- CreateIndex
CREATE INDEX "todoSuggestion_userId_status_createdAt_idx" ON "todoSuggestion"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "todoSuggestion_emailThreadId_userId_idx" ON "todoSuggestion"("emailThreadId", "userId");

-- CreateIndex
CREATE INDEX "todoSuggestion_calendarEventId_userId_idx" ON "todoSuggestion"("calendarEventId", "userId");

-- CreateIndex
CREATE INDEX "emailReply_emailThreadId_userId_status_idx" ON "emailReply"("emailThreadId", "userId", "status");

-- CreateIndex
CREATE INDEX "emailReply_userId_status_idx" ON "emailReply"("userId", "status");

-- AddForeignKey
ALTER TABLE "todoSuggestion" ADD CONSTRAINT "todoSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todoSuggestion" ADD CONSTRAINT "todoSuggestion_emailThreadId_fkey" FOREIGN KEY ("emailThreadId") REFERENCES "emailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todoSuggestion" ADD CONSTRAINT "todoSuggestion_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "calendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todoSuggestion" ADD CONSTRAINT "todoSuggestion_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todoSuggestion" ADD CONSTRAINT "todoSuggestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todoSuggestion" ADD CONSTRAINT "todoSuggestion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailReply" ADD CONSTRAINT "emailReply_emailThreadId_fkey" FOREIGN KEY ("emailThreadId") REFERENCES "emailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailReply" ADD CONSTRAINT "emailReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
