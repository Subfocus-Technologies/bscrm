-- AlterTable
ALTER TABLE "mailboxSync" ADD COLUMN     "caughtUpAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "todoSuggestion" ADD COLUMN     "incomingMeetingNoteId" TEXT;

-- CreateIndex
CREATE INDEX "emailThread_lastMessageAt_idx" ON "emailThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "todoSuggestion_incomingMeetingNoteId_userId_idx" ON "todoSuggestion"("incomingMeetingNoteId", "userId");

-- AddForeignKey
ALTER TABLE "todoSuggestion" ADD CONSTRAINT "todoSuggestion_incomingMeetingNoteId_fkey" FOREIGN KEY ("incomingMeetingNoteId") REFERENCES "incomingMeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
