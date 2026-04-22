# DealLink

A Linktree-style profile + lightweight CRM for real-estate wholesalers, built from the wireframes in `design/wireframes/`.

## What it does

- **Public profile** (`/p/:handle`) — A buyer-facing page with the wholesaler's identity, a featured deal, filterable cards/table list of active inventory, and a "Join buyer list" CTA.
- **Deal detail** (`/p/:handle/:dealId`) — Spec-sheet view with an "I'm interested" CTA that opens a lead-capture modal.
- **Admin dashboard** (`/admin`) — Authenticated table of inventory with filter chips, search, per-row actions (edit, set featured, change status, delete).
- **Add / edit deal** (`/admin/deal/new`, `/admin/deal/:id`) — Sectioned form with live preview rail and the "hide street #" privacy toggle from the wireframes.
- **CSV bulk import** (`/admin/import`) — 3-step flow: drop a file → match columns (auto-detected) → preview with ready / warning / error / duplicate validation → import.
- **Leads inbox** (`/admin/leads`) — Captured deal interest + buyer-list signups.
- **Profile settings** (`/admin/profile`) — Edit handle, name, bio, choose featured deal.
- **Onboarding** (`/onboarding`) — Claim handle → checklist → manual-or-CSV choice modal.
- **Login** (`/login`) — Demo auth (any email + password signs in).

## Stack

- React 18 + Vite 5
- React Router 6
- LocalStorage-backed reducer store (no backend) — see `src/store.jsx` and `src/data.js`
- Pure CSS design tokens in `src/styles.css` mirroring the editorial monochrome wireframe kit

## Project layout

```
src/
  main.jsx, App.jsx          # entry + routes
  styles.css                 # design tokens & utility classes
  data.js                    # seed deals/profile + localStorage helpers
  store.jsx                  # reducer-based context store + toast hook
  components/
    UI.jsx                   # Avatar, Tag, Status, Modal, Field, Stripe, etc.
    AdminShell.jsx           # top-nav for admin pages, auth gate
  pages/
    Landing.jsx
    Login.jsx
    Onboarding.jsx
    PublicProfile.jsx
    DealDetail.jsx
    AdminDashboard.jsx
    AdminLeads.jsx
    AdminProfile.jsx
    DealEditor.jsx
    CsvImport.jsx
    NotFound.jsx

design/wireframes/           # Original wireframe source (untouched)
```

## Run

The "Start application" workflow runs `npm run dev` (Vite on port 5000).

## Notes

- All data persists to `localStorage` under `deallink:state:v1`.
- "Sign in" is a stub — any credentials work, no backend.
- The CSV importer parses simple comma-separated files (no quoted-field escaping); a "Use sample CSV" button loads inline data so the flow is testable end-to-end.
