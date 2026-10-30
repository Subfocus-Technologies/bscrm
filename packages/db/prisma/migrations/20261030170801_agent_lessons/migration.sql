-- CreateEnum
CREATE TYPE "AgentLessonScope" AS ENUM ('PERSONAL', 'TEAM');

-- CreateEnum
CREATE TYPE "AgentLessonOrigin" AS ENUM ('LEARNED', 'TAUGHT');

-- AlterTable
ALTER TABLE "emailReply" ADD COLUMN     "draftBody" TEXT;

-- AlterTable
ALTER TABLE "taskRun" ADD COLUMN     "proposedDeliverable" TEXT;

-- AlterTable
ALTER TABLE "taskRunAction" ADD COLUMN     "proposedPayload" JSONB;

-- CreateTable
CREATE TABLE "agentLesson" (
    "id" TEXT NOT NULL,
    "scope" "AgentLessonScope" NOT NULL,
    "origin" "AgentLessonOrigin" NOT NULL,
    "text" TEXT NOT NULL,
    "createdById" TEXT,
    "taskRunId" TEXT,
    "retiredAt" TIMESTAMP(3),
    "retiredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agentLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agentLesson_scope_retiredAt_createdAt_idx" ON "agentLesson"("scope", "retiredAt", "createdAt");

-- CreateIndex
CREATE INDEX "agentLesson_createdById_retiredAt_createdAt_idx" ON "agentLesson"("createdById", "retiredAt", "createdAt");

-- CreateIndex
CREATE INDEX "agentLesson_taskRunId_idx" ON "agentLesson"("taskRunId");

-- AddForeignKey
ALTER TABLE "agentLesson" ADD CONSTRAINT "agentLesson_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentLesson" ADD CONSTRAINT "agentLesson_taskRunId_fkey" FOREIGN KEY ("taskRunId") REFERENCES "taskRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentLesson" ADD CONSTRAINT "agentLesson_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
