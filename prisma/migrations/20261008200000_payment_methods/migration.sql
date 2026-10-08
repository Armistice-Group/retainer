-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('ACH', 'WIRE', 'CHECK', 'STRIPE_LINK', 'PADDLE', 'PAYPAL', 'VENMO', 'ZELLE', 'CRYPTO', 'OTHER');

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "label" TEXT,
    "details" JSONB NOT NULL,
    "showOnPdf" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentMethod_orgId_clientId_idx" ON "PaymentMethod"("orgId", "clientId");

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Carry existing free-text payment instructions over as "Other" methods,
-- keeping the private flag as "not on the PDF".
INSERT INTO "PaymentMethod" ("id", "type", "label", "details", "showOnPdf", "sortOrder", "createdAt", "updatedAt", "orgId", "clientId")
SELECT gen_random_uuid()::text, 'OTHER', NULL, jsonb_build_object('text', "paymentInstructions"),
       NOT "paymentInstructionsPrivate", 0, now(), now(), "id", NULL
FROM "Organization"
WHERE "paymentInstructions" IS NOT NULL AND btrim("paymentInstructions") <> '';

INSERT INTO "PaymentMethod" ("id", "type", "label", "details", "showOnPdf", "sortOrder", "createdAt", "updatedAt", "orgId", "clientId")
SELECT gen_random_uuid()::text, 'OTHER', NULL, jsonb_build_object('text', "paymentInstructions"),
       NOT COALESCE("paymentInstructionsPrivate", false), 0, now(), now(), "orgId", "id"
FROM "Client"
WHERE "paymentInstructions" IS NOT NULL AND btrim("paymentInstructions") <> '';
