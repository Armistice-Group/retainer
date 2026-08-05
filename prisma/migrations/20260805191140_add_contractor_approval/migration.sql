-- CreateEnum
CREATE TYPE "MembershipType" AS ENUM ('EMPLOYEE', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "ProjectMemberApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "employmentType" "MembershipType" NOT NULL DEFAULT 'EMPLOYEE',
ADD COLUMN     "resumeContentType" TEXT,
ADD COLUMN     "resumeFileData" BYTEA,
ADD COLUMN     "resumeFileName" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "approvalRequestedAt" TIMESTAMP(3),
ADD COLUMN     "approvalRespondedAt" TIMESTAMP(3),
ADD COLUMN     "approvalStatus" "ProjectMemberApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "approvalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_approvalToken_key" ON "ProjectMember"("approvalToken");

