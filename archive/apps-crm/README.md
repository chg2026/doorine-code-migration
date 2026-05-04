# CHG CRM — Cleveland Holding Group

Operations CRM for tracking construction projects, tenants, deals, tasks, and finances.

## Stack
- **Backend:** Node.js / Express 5 on port 3000
- **Frontend:** React (served as static build from Express)
- **Database:** Supabase (PostgreSQL)

## Local development

```bash
cp .env.example .env       # fill in your Supabase credentials
npm install
cd client && npm install && cd ..
npm run dev                # runs server (3000) + React dev server (3001) concurrently
```

## Production / Replit deployment

```bash
npm run build              # builds React into client/build
npm start                  # serves everything from port 3000
```

**Replit env vars:** Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in **Replit → Secrets** (not in a `.env` file). Replit injects secrets as environment variables automatically. Do not commit `.env` — it is gitignored.

## Database setup

Run `scripts/schema.sql` in the Supabase SQL Editor to create all tables, then:

```bash
npm run seed               # inserts initial property, contractor, projects, and phases
```
