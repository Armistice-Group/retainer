-- AlterTable
ALTER TABLE "SsoConnection" ADD COLUMN     "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "autoProvision" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "defaultRole" "Role" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "enforced" BOOLEAN NOT NULL DEFAULT false;
