-- CreateEnum
CREATE TYPE "TaskRunStatus" AS ENUM ('QUEUED', 'WORKING', 'AWAITING_APPROVAL', 'FINISHED');

-- CreateEnum
CREATE TYPE "TaskRunActionKind" AS ENUM ('EMAIL', 'EVENT', 'TODO', 'PULL_REQUEST');

-- CreateEnum
CREATE TYPE "TaskRunActionStatus" AS ENUM ('PROPOSED', 'RUNNING', 'DONE', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "taskRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instructions" TEXT,
    "status" "TaskRunStatus" NOT NULL DEFAULT 'QUEUED',
    "summary" TEXT,
    "deliverable" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taskRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taskRunAction" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "TaskRunActionKind" NOT NULL,
    "why" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "TaskRunActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "result" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taskRunAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "taskRun_userId_status_createdAt_idx" ON "taskRun"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "taskRun_taskId_createdAt_idx" ON "taskRun"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "taskRunAction_runId_position_idx" ON "taskRunAction"("runId", "position");

-- AddForeignKey
ALTER TABLE "taskRun" ADD CONSTRAINT "taskRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskRun" ADD CONSTRAINT "taskRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskRunAction" ADD CONSTRAINT "taskRunAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "taskRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskRunAction" ADD CONSTRAINT "taskRunAction_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
