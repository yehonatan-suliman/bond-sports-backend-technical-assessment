-- CreateIndex
CREATE UNIQUE INDEX "accounts_personId_accountType_key" ON "accounts"("personId", "accountType");
