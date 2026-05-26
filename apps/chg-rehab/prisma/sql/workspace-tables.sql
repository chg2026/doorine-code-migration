-- Workspace module (Task #1) — create new tables only.
-- Applied manually because `prisma db push` introspection trips on the
-- pre-existing `public.account_products → auth.users` cross-schema FK.
-- This script is idempotent: every CREATE uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "WsTask" (
  "id"              TEXT PRIMARY KEY,
  "companyId"       TEXT NOT NULL,
  "createdById"     TEXT NOT NULL,
  "assigneeId"      TEXT,
  "title"           TEXT NOT NULL,
  "description"     TEXT,
  "priority"        TEXT NOT NULL DEFAULT 'Medium',
  "dueDate"         TIMESTAMP(3),
  "done"            BOOLEAN NOT NULL DEFAULT false,
  "doneAt"          TIMESTAMP(3),
  "linkType"        TEXT,
  "linkId"          TEXT,
  "linkLabel"       TEXT,
  "sourceMessageId" TEXT UNIQUE,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WsTask_companyId_done_dueDate_idx"        ON "WsTask"("companyId","done","dueDate");
CREATE INDEX IF NOT EXISTS "WsTask_companyId_assigneeId_done_idx"     ON "WsTask"("companyId","assigneeId","done");
CREATE INDEX IF NOT EXISTS "WsTask_companyId_createdById_done_idx"    ON "WsTask"("companyId","createdById","done");

CREATE TABLE IF NOT EXISTS "WsChannel" (
  "id"          TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "slug"        TEXT,
  "name"        TEXT NOT NULL,
  "partyType"   TEXT,
  "partyId"     TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WsChannel_companyId_kind_slug_key"
  ON "WsChannel"("companyId","kind","slug");
CREATE UNIQUE INDEX IF NOT EXISTS "WsChannel_companyId_kind_partyType_partyId_key"
  ON "WsChannel"("companyId","kind","partyType","partyId");
CREATE INDEX IF NOT EXISTS "WsChannel_companyId_kind_idx"
  ON "WsChannel"("companyId","kind");

CREATE TABLE IF NOT EXISTS "WsChannelMember" (
  "id"          TEXT PRIMARY KEY,
  "channelId"   TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "lastReadAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WsChannelMember_channelId_userId_key"
  ON "WsChannelMember"("channelId","userId");
CREATE INDEX IF NOT EXISTS "WsChannelMember_userId_idx" ON "WsChannelMember"("userId");

CREATE TABLE IF NOT EXISTS "WsMessage" (
  "id"              TEXT PRIMARY KEY,
  "companyId"       TEXT NOT NULL,
  "channelId"       TEXT NOT NULL,
  "authorUserId"    TEXT,
  "authorLabel"     TEXT,
  "body"            TEXT NOT NULL,
  "convertedTaskId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WsMessage_channelId_createdAt_idx" ON "WsMessage"("channelId","createdAt");
CREATE INDEX IF NOT EXISTS "WsMessage_companyId_createdAt_idx" ON "WsMessage"("companyId","createdAt");

CREATE TABLE IF NOT EXISTS "WsGoal" (
  "id"          TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL,
  "ownerUserId" TEXT,
  "title"       TEXT NOT NULL,
  "scope"       TEXT NOT NULL DEFAULT 'company',
  "period"      TEXT,
  "metricMode"  TEXT NOT NULL DEFAULT 'count',
  "current"     INTEGER NOT NULL DEFAULT 0,
  "target"      INTEGER NOT NULL DEFAULT 1,
  "done"        BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WsGoal_companyId_scope_idx" ON "WsGoal"("companyId","scope");
CREATE INDEX IF NOT EXISTS "WsGoal_companyId_ownerUserId_idx" ON "WsGoal"("companyId","ownerUserId");

CREATE TABLE IF NOT EXISTS "WsReminder" (
  "id"          TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL,
  "userId"      TEXT,
  "title"       TEXT NOT NULL,
  "source"      TEXT,
  "link"        TEXT,
  "remindAt"    TIMESTAMP(3),
  "urgent"      BOOLEAN NOT NULL DEFAULT false,
  "done"        BOOLEAN NOT NULL DEFAULT false,
  "doneAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WsReminder_companyId_done_remindAt_idx" ON "WsReminder"("companyId","done","remindAt");
CREATE INDEX IF NOT EXISTS "WsReminder_companyId_userId_done_idx" ON "WsReminder"("companyId","userId","done");

CREATE TABLE IF NOT EXISTS "WsCalendarEvent" (
  "id"          TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL,
  "createdById" TEXT,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "startAt"     TIMESTAMP(3) NOT NULL,
  "endAt"       TIMESTAMP(3),
  "link"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WsCalendarEvent_companyId_startAt_idx" ON "WsCalendarEvent"("companyId","startAt");

-- Foreign keys (created NOT VALID + ALTER ... VALIDATE pattern is overkill for
-- new tables; straight ADD CONSTRAINT is fine here). Idempotent via NOT EXISTS
-- check on pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WsTask_companyId_fkey') THEN
    ALTER TABLE "WsTask"          ADD CONSTRAINT "WsTask_companyId_fkey"          FOREIGN KEY ("companyId")        REFERENCES "Company"("id")    ON DELETE CASCADE;
    ALTER TABLE "WsTask"          ADD CONSTRAINT "WsTask_createdById_fkey"        FOREIGN KEY ("createdById")      REFERENCES "User"("id")       ON DELETE CASCADE;
    ALTER TABLE "WsTask"          ADD CONSTRAINT "WsTask_assigneeId_fkey"         FOREIGN KEY ("assigneeId")       REFERENCES "User"("id")       ON DELETE SET NULL;
    ALTER TABLE "WsTask"          ADD CONSTRAINT "WsTask_sourceMessageId_fkey"    FOREIGN KEY ("sourceMessageId")  REFERENCES "WsMessage"("id")  ON DELETE SET NULL;
    ALTER TABLE "WsChannel"       ADD CONSTRAINT "WsChannel_companyId_fkey"       FOREIGN KEY ("companyId")        REFERENCES "Company"("id")    ON DELETE CASCADE;
    ALTER TABLE "WsChannelMember" ADD CONSTRAINT "WsChannelMember_channelId_fkey" FOREIGN KEY ("channelId")        REFERENCES "WsChannel"("id")  ON DELETE CASCADE;
    ALTER TABLE "WsChannelMember" ADD CONSTRAINT "WsChannelMember_userId_fkey"    FOREIGN KEY ("userId")           REFERENCES "User"("id")       ON DELETE CASCADE;
    ALTER TABLE "WsMessage"       ADD CONSTRAINT "WsMessage_companyId_fkey"       FOREIGN KEY ("companyId")        REFERENCES "Company"("id")    ON DELETE CASCADE;
    ALTER TABLE "WsMessage"       ADD CONSTRAINT "WsMessage_channelId_fkey"       FOREIGN KEY ("channelId")        REFERENCES "WsChannel"("id")  ON DELETE CASCADE;
    ALTER TABLE "WsMessage"       ADD CONSTRAINT "WsMessage_authorUserId_fkey"    FOREIGN KEY ("authorUserId")     REFERENCES "User"("id")       ON DELETE SET NULL;
    ALTER TABLE "WsGoal"          ADD CONSTRAINT "WsGoal_companyId_fkey"          FOREIGN KEY ("companyId")        REFERENCES "Company"("id")    ON DELETE CASCADE;
    ALTER TABLE "WsGoal"          ADD CONSTRAINT "WsGoal_ownerUserId_fkey"        FOREIGN KEY ("ownerUserId")      REFERENCES "User"("id")       ON DELETE SET NULL;
    ALTER TABLE "WsReminder"      ADD CONSTRAINT "WsReminder_companyId_fkey"      FOREIGN KEY ("companyId")        REFERENCES "Company"("id")    ON DELETE CASCADE;
    ALTER TABLE "WsReminder"      ADD CONSTRAINT "WsReminder_userId_fkey"         FOREIGN KEY ("userId")           REFERENCES "User"("id")       ON DELETE SET NULL;
    ALTER TABLE "WsCalendarEvent" ADD CONSTRAINT "WsCalendarEvent_companyId_fkey" FOREIGN KEY ("companyId")        REFERENCES "Company"("id")    ON DELETE CASCADE;
    ALTER TABLE "WsCalendarEvent" ADD CONSTRAINT "WsCalendarEvent_createdById_fkey" FOREIGN KEY ("createdById")    REFERENCES "User"("id")       ON DELETE SET NULL;
  END IF;
END $$;
