-- CreateEnum
CREATE TYPE "MeetingFollowUpKind" AS ENUM ('TODO', 'NEXT_STEP');

-- CreateEnum
CREATE TYPE "MeetingFollowUpStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "meetingFollowUp" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "kind" "MeetingFollowUpKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "owner" TEXT,
    "dueAt" TIMESTAMP(3),
    "quote" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "MeetingFollowUpStatus" NOT NULL DEFAULT 'PROPOSED',
    "taskId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetingFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meetingFollowUp_taskId_key" ON "meetingFollowUp"("taskId");

-- CreateIndex
CREATE INDEX "meetingFollowUp_activityId_position_idx" ON "meetingFollowUp"("activityId", "position");

-- AddForeignKey
ALTER TABLE "meetingFollowUp" ADD CONSTRAINT "meetingFollowUp_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetingFollowUp" ADD CONSTRAINT "meetingFollowUp_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetingFollowUp" ADD CONSTRAINT "meetingFollowUp_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
