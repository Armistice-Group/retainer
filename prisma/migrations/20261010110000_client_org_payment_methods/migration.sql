-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "excludedOrgPaymentMethodIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "useOrgPaymentMethods" BOOLEAN NOT NULL DEFAULT true;


-- Until now a client's own payment methods replaced the org's; keep that for
-- clients that already have their own.
UPDATE "Client" SET "useOrgPaymentMethods" = false
WHERE EXISTS (SELECT 1 FROM "PaymentMethod" pm WHERE pm."clientId" = "Client"."id");
