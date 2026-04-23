# @rei-code/api-client

Shared API client used by both `apps/chg` and `apps/deallink` to call the Express server at `/server/`.

## What lives here (eventually)

- **Auth client** — `login()`, `logout()`, `me()` returning the full entitlements payload described in blueprint §08 (which products the user has, per-product plan, per-product role, permissions).
- **Product-scoped resource clients** — typed helpers around `/api/properties`, `/api/deals`, `/api/tasks`, etc. One call site per resource, one place to add retries, auth headers, error handling.
- **Session coordinator** — the token-exchange helper for the cross-domain hop between `app.chg.io` and `deallink.io` (blueprint risk register: shared session across domains).

## What is here today

An empty scaffold. This workspace is declared so that when the API client is extracted (Phase 2 per blueprint §12), there's already a place for it.

## Consumers

- `apps/chg` → will import via `@rei-code/api-client`
- `apps/deallink` → will import via `@rei-code/api-client`

## Stack

Plain JavaScript. No framework coupling — works in both React apps and in Node (for SSR or scripts).
