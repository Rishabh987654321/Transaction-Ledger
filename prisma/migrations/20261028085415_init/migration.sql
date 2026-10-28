-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "balance_minor" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "reference_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transfer_id" UUID,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_account_id_created_at_id_idx" ON "transactions"("account_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_account_id_reference_id_key" ON "transactions"("account_id", "reference_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraints
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_balance_minor_non_negative" CHECK ("balance_minor" >= 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_minor_positive" CHECK ("amount_minor" > 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_type_valid" CHECK ("type" IN ('credit', 'debit'));
