-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "shareTasks" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN     "sharedWithClient" BOOLEAN NOT NULL DEFAULT false;

