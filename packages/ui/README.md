# @rei-code/ui

Shared React component library used by both `apps/chg` and `apps/deallink`.

## What lives here (eventually)

- **AppSwitcher** — the 3×3 grid widget in the top-left of every product (blueprint §08). Renders from `/auth/me` entitlements.
- **Topbar** — shared header chrome including the AppSwitcher mount point.
- **Editorial primitives** — colors, Btn, Stripe, Avatar extracted from `apps/deallink/wire-kit.jsx`. These define the house style: Tiempos Text serif, SF Mono labels, cream `#FAF8F4` background, `#E5E3DE` hairlines.

## What is here today

An empty scaffold. This workspace is declared so that when the shared components are extracted (Phase 3 per blueprint §12), there's already a place for them.

## Consumers

- `apps/chg` → will import via `@rei-code/ui`
- `apps/deallink` → will import via `@rei-code/ui`

## Stack

Plain JavaScript (JSX), matching existing house style. React 18 peer dependency.
