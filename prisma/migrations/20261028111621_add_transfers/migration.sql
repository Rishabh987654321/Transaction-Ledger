-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_account_id" UUID NOT NULL,
    "destination_account_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "reference_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transfers_source_account_id_reference_id_key" ON "transfers"("source_account_id", "reference_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destination_account_id_fkey" FOREIGN KEY ("destination_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraints
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_amount_minor_positive" CHECK ("amount_minor" > 0);
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_distinct_accounts" CHECK ("source_account_id" != "destination_account_id");
