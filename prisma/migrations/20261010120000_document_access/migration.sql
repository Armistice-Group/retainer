-- CreateEnum
CREATE TYPE "DocumentAccess" AS ENUM ('EVERYONE', 'ADMINS', 'SELECTED');

-- AlterTable
ALTER TABLE "ClientDocument" ADD COLUMN     "access" "DocumentAccess" NOT NULL DEFAULT 'EVERYONE',
ADD COLUMN     "allowedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

