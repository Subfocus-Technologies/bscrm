-- CreateTable
CREATE TABLE "workspaceAccess" (
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaceAccess_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "workspaceRemoval" (
    "email" TEXT NOT NULL,
    "removedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaceRemoval_pkey" PRIMARY KEY ("email")
);

-- AddForeignKey
ALTER TABLE "workspaceAccess" ADD CONSTRAINT "workspaceAccess_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaceRemoval" ADD CONSTRAINT "workspaceRemoval_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
