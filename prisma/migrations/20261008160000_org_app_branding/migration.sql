-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "appAccentFromBrand" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "appBranding" BOOLEAN NOT NULL DEFAULT false;
