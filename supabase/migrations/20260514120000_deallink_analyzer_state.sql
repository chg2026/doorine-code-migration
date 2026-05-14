-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Link — Deal Analyzer state persistence (Task #4)
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds a single JSONB column on deallink_deals to store the per-deal
-- Deal Analyzer state (strategy, financing inputs, income/operations,
-- rehab line items, refi assumptions, computed snapshot). Keeping it as
-- one opaque JSONB blob means we can iterate on the analyzer schema
-- without further DDL.
--
-- The shape, written by the React client, is roughly:
--   {
--     "strategy": "brrrr",
--     "subtab": "rehab",
--     "purchasePrice": 295000,
--     "arv": 0,
--     "downPct": 20, "rate": 8.25, "term": 30, "closingPct": 2.5,
--     "monthlyRent": 1900, "vacancyPct": 8, "taxesYr": 4200, "insYr": 1400,
--     "mgmtPct": 12, "maintPct": 10, "capexPct": 10, "holdingMo": 6,
--     "rehabOverride": 8000,
--     "items": [{"id":"r1","category":"Flooring","description":"…","cost":4500}],
--     "refiArv": 0, "refiLTV": 75, "refiRate": 7.5,
--     "snapshot": { "mao": 123000, "monthlyCashFlow": 350, "coc": 9.2, ... },
--     "savedAt": "2026-05-14T21:40:00.000Z"
--   }
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.deallink_deals
  ADD COLUMN IF NOT EXISTS analyzer_state JSONB;

COMMIT;
