# CHG CRM

Internal CRM system for Cleveland Holding Group, used for real estate portfolio management, construction project tracking, property management, and acquisitions.

## Architecture

- **Frontend**: React (Create React App) running on port 5000 at `0.0.0.0`
- **Backend**: Node.js + Express API running on port 3000
- **Database**: Supabase (PostgreSQL)
- **Proxy**: React dev server proxies `/api/*` requests to `http://localhost:3000`

## Project Structure

```
/client          - React frontend (Create React App)
  /src
    App.js       - Main single-page application
/server          - Express backend
  index.js       - Entry point
  db.js          - Supabase client
  /routes        - API route handlers (properties, tenants, projects, deals, tasks, invoices, contractors)
/scripts         - DB utilities (schema.sql, seed.js)
```

## Environment Variables / Secrets Required

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key

## Running the App

- **Development**: `npm run dev` — starts both frontend (port 5000) and backend (port 3000) concurrently
- **Backend only**: `npm run start:server`
- **Frontend only**: `npm run start:client`
- **Seed database**: `npm run seed`

## Workflow

A single workflow "Start application" runs `npm run dev` and serves on port 5000 (webview).

## Recent Architecture Notes

- **Atomic project + phases creation**: `POST /api/projects` accepts an optional `phases: string[]` field. Server creates the project, then bulk-inserts phase rows; if phase insert fails, the project is rolled back so the client never sees a partial state.
- **Cascade deletes**: `DELETE /api/projects/:id` removes child phases first; `DELETE /api/properties/:id` removes child projects (with their phases), invoices, tenants, and property tasks before deleting the property; `DELETE /api/contractors/:id` nulls `contractor_id` on linked projects first.
- **Properties payload sanitization**: `clean()` in `server/routes/properties.js` converts empty strings to `null` (Postgres dates/numerics reject `''`) and keeps the `type` and `property_type` columns in sync.
- **Standard phase library**: `STANDARD_PHASE_GROUPS` in `client/src/App.js` defines ~22 pre-loaded phases across 6 categories (Structural/Prep, MEP, Walls & Ceiling, Bathroom Remodel, Flooring, Finishes & Install). The Project Form Modal renders these as a checklist (create mode only) with group-level toggles.
- **Contractors directory**: dedicated tab + `ContractorModal` for full CRUD with W-9 status (pending/on_file/not_required) and agreement-signed flag.

## Deployment

- Target: autoscale
- Build: `cd client && npm run build`
- Run: `node server/index.js & npx serve -s client/build -l 5000`
