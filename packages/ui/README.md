# @rei-code/ui

Shared React component library for the Rei-Code monorepo.

> **Note:** Earlier drafts of this README listed `apps/crm` as a consumer. That workspace has been retired and moved to `archive/apps-crm/` — it does not import from this package. The active consumers are listed below.

## What lives here (eventually)

- **AppSwitcher** — the 3×3 grid widget in the top-left of every product (blueprint §08, now historical). Renders from `/auth/me` entitlements.
- **Topbar** — shared header chrome including the AppSwitcher mount point.
- **Editorial primitives** — colors, Btn, Stripe, Avatar from the original Deal Link wire-kit. These define the house style: Tiempos Text serif, SF Mono labels, cream `#FAF8F4` background, `#E5E3DE` hairlines.

## What is here today

An empty scaffold. This workspace is declared so that when the shared components are extracted, there's already a place for them.

## Consumers

- `apps/chg-rehab` → will import via `@rei-code/ui`
- `apps/crmdeallink` → will import via `@rei-code/ui`
- `apps/investor-portal` → will import via `@rei-code/ui`
- `apps/crm` → **retired**, archived at `archive/apps-crm/`

## Stack

Plain JavaScript (JSX), matching existing house style. React 18 peer dependency.
