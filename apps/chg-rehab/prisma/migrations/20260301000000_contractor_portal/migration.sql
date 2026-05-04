-- Contractor Portal (Cp*) tables — Task #23

-- CreateTable
CREATE TABLE "CpAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "phone" TEXT,
    "trade" TEXT,
    "licenseNumber" TEXT,
    "planTier" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "contractorPortalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "messagingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "CpAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpOperatorEdge" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "inviterAccountId" TEXT,
    "layer1CompanyId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'invite',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpOperatorEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpJob" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "trade" TEXT,
    "contractAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "invoicedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "photoRequested" BOOLEAN NOT NULL DEFAULT false,
    "awardedByCompanyId" TEXT,
    "awardedByAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpQuote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "jobId" TEXT,
    "jobName" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "toCompanyId" TEXT,
    "toAccountId" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "viewed" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpQuoteLineItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ord" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CpQuoteLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "jobId" TEXT,
    "jobName" TEXT NOT NULL,
    "description" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "toCompanyId" TEXT,
    "toAccountId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "CpInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpComplianceDoc" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "fileName" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'current',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpComplianceDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpJobPhoto" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "caption" TEXT,
    "objectPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpJobPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpMessageThread" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "subject" TEXT NOT NULL,
    "contractorAId" TEXT NOT NULL,
    "contractorBId" TEXT,
    "layer1CompanyId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpMessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderAccountId" TEXT,
    "senderCompanyId" TEXT,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "unread" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpBidInvitation" (
    "id" TEXT NOT NULL,
    "invitedAccountId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobLocation" TEXT,
    "trade" TEXT,
    "scopeRangeLow" DECIMAL(14,2),
    "scopeRangeHigh" DECIMAL(14,2),
    "bidDueAt" TIMESTAMP(3),
    "fromCompanyId" TEXT,
    "fromAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpBidInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpBidProposal" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "durationDays" INTEGER,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpBidProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpOnboardingInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyName" TEXT,
    "contactName" TEXT,
    "trade" TEXT,
    "token" TEXT NOT NULL,
    "inviterCompanyId" TEXT,
    "inviterAccountId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "consumedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpOnboardingInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpQuotaUsage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "quotesUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpQuotaUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpSentMessage" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "toAccountId" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "meta" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpSentMessage_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "CpAccount_email_key" ON "CpAccount"("email");
-- CreateIndex
CREATE INDEX "CpOperatorEdge_contractorId_idx" ON "CpOperatorEdge"("contractorId");
-- CreateIndex
CREATE INDEX "CpOperatorEdge_layer1CompanyId_idx" ON "CpOperatorEdge"("layer1CompanyId");
-- CreateIndex
CREATE INDEX "CpOperatorEdge_inviterAccountId_idx" ON "CpOperatorEdge"("inviterAccountId");
-- CreateIndex
CREATE UNIQUE INDEX "CpOperatorEdge_contractorId_inviterAccountId_layer1CompanyI_key" ON "CpOperatorEdge"("contractorId", "inviterAccountId", "layer1CompanyId");
-- CreateIndex
CREATE INDEX "CpJob_contractorId_status_idx" ON "CpJob"("contractorId", "status");
-- CreateIndex
CREATE UNIQUE INDEX "CpQuote_number_key" ON "CpQuote"("number");
-- CreateIndex
CREATE INDEX "CpQuote_fromAccountId_status_idx" ON "CpQuote"("fromAccountId", "status");
-- CreateIndex
CREATE INDEX "CpQuote_toCompanyId_status_idx" ON "CpQuote"("toCompanyId", "status");
-- CreateIndex
CREATE INDEX "CpQuote_toAccountId_status_idx" ON "CpQuote"("toAccountId", "status");
-- CreateIndex
CREATE INDEX "CpQuoteLineItem_quoteId_idx" ON "CpQuoteLineItem"("quoteId");
-- CreateIndex
CREATE UNIQUE INDEX "CpInvoice_number_key" ON "CpInvoice"("number");
-- CreateIndex
CREATE INDEX "CpInvoice_fromAccountId_status_idx" ON "CpInvoice"("fromAccountId", "status");
-- CreateIndex
CREATE INDEX "CpInvoice_toCompanyId_status_idx" ON "CpInvoice"("toCompanyId", "status");
-- CreateIndex
CREATE INDEX "CpComplianceDoc_accountId_docType_idx" ON "CpComplianceDoc"("accountId", "docType");
-- CreateIndex
CREATE INDEX "CpJobPhoto_jobId_idx" ON "CpJobPhoto"("jobId");
-- CreateIndex
CREATE INDEX "CpMessageThread_contractorAId_idx" ON "CpMessageThread"("contractorAId");
-- CreateIndex
CREATE INDEX "CpMessageThread_contractorBId_idx" ON "CpMessageThread"("contractorBId");
-- CreateIndex
CREATE INDEX "CpMessageThread_layer1CompanyId_idx" ON "CpMessageThread"("layer1CompanyId");
-- CreateIndex
CREATE INDEX "CpMessage_threadId_createdAt_idx" ON "CpMessage"("threadId", "createdAt");
-- CreateIndex
CREATE INDEX "CpBidInvitation_invitedAccountId_status_idx" ON "CpBidInvitation"("invitedAccountId", "status");
-- CreateIndex
CREATE UNIQUE INDEX "CpBidProposal_invitationId_fromAccountId_key" ON "CpBidProposal"("invitationId", "fromAccountId");
-- CreateIndex
CREATE UNIQUE INDEX "CpOnboardingInvite_token_key" ON "CpOnboardingInvite"("token");
-- CreateIndex
CREATE INDEX "CpOnboardingInvite_email_idx" ON "CpOnboardingInvite"("email");
-- CreateIndex
CREATE INDEX "CpOnboardingInvite_inviterCompanyId_idx" ON "CpOnboardingInvite"("inviterCompanyId");
-- CreateIndex
CREATE INDEX "CpOnboardingInvite_inviterAccountId_idx" ON "CpOnboardingInvite"("inviterAccountId");
-- CreateIndex
CREATE UNIQUE INDEX "CpQuotaUsage_accountId_yearMonth_key" ON "CpQuotaUsage"("accountId", "yearMonth");
-- CreateIndex
CREATE INDEX "CpSentMessage_toAddress_idx" ON "CpSentMessage"("toAddress");
-- CreateIndex
CREATE INDEX "CpSentMessage_sentAt_idx" ON "CpSentMessage"("sentAt");

-- Foreign keys
ALTER TABLE "CpOperatorEdge" ADD CONSTRAINT "CpOperatorEdge_inviterAccountId_fkey" FOREIGN KEY ("inviterAccountId") REFERENCES "CpAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpOperatorEdge" ADD CONSTRAINT "CpOperatorEdge_layer1CompanyId_fkey" FOREIGN KEY ("layer1CompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpJob" ADD CONSTRAINT "CpJob_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "CpAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpJob" ADD CONSTRAINT "CpJob_awardedByCompanyId_fkey" FOREIGN KEY ("awardedByCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpJob" ADD CONSTRAINT "CpJob_awardedByAccountId_fkey" FOREIGN KEY ("awardedByAccountId") REFERENCES "CpAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpQuote" ADD CONSTRAINT "CpQuote_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "CpAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpQuote" ADD CONSTRAINT "CpQuote_toCompanyId_fkey" FOREIGN KEY ("toCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpQuote" ADD CONSTRAINT "CpQuote_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "CpAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpQuote" ADD CONSTRAINT "CpQuote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CpJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpQuoteLineItem" ADD CONSTRAINT "CpQuoteLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "CpQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpInvoice" ADD CONSTRAINT "CpInvoice_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "CpAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpInvoice" ADD CONSTRAINT "CpInvoice_toCompanyId_fkey" FOREIGN KEY ("toCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpInvoice" ADD CONSTRAINT "CpInvoice_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "CpAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpInvoice" ADD CONSTRAINT "CpInvoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CpJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpComplianceDoc" ADD CONSTRAINT "CpComplianceDoc_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CpAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpJobPhoto" ADD CONSTRAINT "CpJobPhoto_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CpJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpMessageThread" ADD CONSTRAINT "CpMessageThread_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CpJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpMessageThread" ADD CONSTRAINT "CpMessageThread_contractorAId_fkey" FOREIGN KEY ("contractorAId") REFERENCES "CpAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpMessageThread" ADD CONSTRAINT "CpMessageThread_contractorBId_fkey" FOREIGN KEY ("contractorBId") REFERENCES "CpAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpMessageThread" ADD CONSTRAINT "CpMessageThread_layer1CompanyId_fkey" FOREIGN KEY ("layer1CompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpMessage" ADD CONSTRAINT "CpMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CpMessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpMessage" ADD CONSTRAINT "CpMessage_senderAccountId_fkey" FOREIGN KEY ("senderAccountId") REFERENCES "CpAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpBidInvitation" ADD CONSTRAINT "CpBidInvitation_invitedAccountId_fkey" FOREIGN KEY ("invitedAccountId") REFERENCES "CpAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpBidInvitation" ADD CONSTRAINT "CpBidInvitation_fromCompanyId_fkey" FOREIGN KEY ("fromCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpBidProposal" ADD CONSTRAINT "CpBidProposal_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "CpBidInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpBidProposal" ADD CONSTRAINT "CpBidProposal_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "CpAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpOnboardingInvite" ADD CONSTRAINT "CpOnboardingInvite_inviterCompanyId_fkey" FOREIGN KEY ("inviterCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpOnboardingInvite" ADD CONSTRAINT "CpOnboardingInvite_inviterAccountId_fkey" FOREIGN KEY ("inviterAccountId") REFERENCES "CpAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpQuotaUsage" ADD CONSTRAINT "CpQuotaUsage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CpAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CpSentMessage" ADD CONSTRAINT "CpSentMessage_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "CpAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
