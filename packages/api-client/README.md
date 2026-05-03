# @rei-code/api-client

Shared API client used by the Rei-Code monorepo apps to call the Express server at `/server/`.

> **Note:** Earlier drafts of this README listed `apps/crm` as a consumer. That workspace has been retired and moved to `archive/apps-crm/` — it does not import from this package. The active consumers are listed below.

## What lives here (eventually)

- **Auth client** — `login()`, `logout()`, `me()` returning the full entitlements payload described in blueprint §08 (now historical) — which products the user has, per-product plan, per-product role, permissions.
- **Product-scoped resource clients** — typed helpers around `/api/properties`, `/api/deals`, `/api/tasks`, etc. One call site per resource, one place to add retries, auth headers, error handling.
- **Session coordinator** — the token-exchange helper for cross-domain session sharing between product frontends (originally described in the blueprint risk register).

## What is here today

An empty scaffold. This workspace is declared so that when the API client is extracted, there's already a place for it.

## Consumers

- `apps/chg-rehab` → will import via `@rei-code/api-client`
- `apps/crmdeallink` → will import via `@rei-code/api-client`
- `apps/investor-portal` → will import via `@rei-code/api-client`
- `apps/crm` → **retired**, archived at `archive/apps-crm/`

## Stack

Plain JavaScript. No framework coupling — works in both React apps and in Node (for SSR or scripts).
