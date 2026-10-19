-- CreateEnum
CREATE TYPE "IncomingMeetingNoteStatus" AS ENUM ('NEW', 'FILED', 'IGNORED', 'DUPLICATE');

-- CreateTable
CREATE TABLE "incomingMeetingNote" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "mailboxUserId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "docUrl" TEXT,
    "heldAt" TIMESTAMP(3) NOT NULL,
    "calendarEventId" TEXT,
    "status" "IncomingMeetingNoteStatus" NOT NULL DEFAULT 'NEW',
    "activityId" TEXT,
    "filedById" TEXT,
    "filedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incomingMeetingNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incomingMeetingNote_gmailMessageId_key" ON "incomingMeetingNote"("gmailMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "incomingMeetingNote_activityId_key" ON "incomingMeetingNote"("activityId");

-- CreateIndex
CREATE INDEX "incomingMeetingNote_status_heldAt_idx" ON "incomingMeetingNote"("status", "heldAt");

-- CreateIndex
CREATE INDEX "incomingMeetingNote_docUrl_idx" ON "incomingMeetingNote"("docUrl");

-- AddForeignKey
ALTER TABLE "incomingMeetingNote" ADD CONSTRAINT "incomingMeetingNote_mailboxUserId_fkey" FOREIGN KEY ("mailboxUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomingMeetingNote" ADD CONSTRAINT "incomingMeetingNote_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "calendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomingMeetingNote" ADD CONSTRAINT "incomingMeetingNote_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomingMeetingNote" ADD CONSTRAINT "incomingMeetingNote_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
