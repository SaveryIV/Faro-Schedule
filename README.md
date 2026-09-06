# Faro Schedule

Internal booking app for the office's two shared spaces — **Hall** and **Meeting Room**.

- Coworkers **request access** with email + password; an **admin approves** them before they can do
  anything.
- Approved users **see all bookings** (week calendar + list) and **create bookings** (pick a space,
  a start and end time, a title).
- **No two bookings can overlap in the same space** — enforced by a Postgres exclusion constraint,
  so even simultaneous requests cannot double-book. Back-to-back bookings (…–11:00, 11:00–…) are
  allowed.

## Stack

Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL · Auth.js v5 (credentials) · Tailwind CSS.

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill it in:
   - `DATABASE_URL` — the **pooled** Neon connection (host contains `-pooler`). Used at runtime.
   - `DIRECT_URL` — the **direct** Neon connection (same URL without `-pooler`). Used by Prisma
     Migrate; DDL and advisory locks don't work through the pooler.
   - `AUTH_SECRET` — run `npx auth secret` or `openssl rand -base64 33`.
   - `OFFICE_TZ` — the office's IANA timezone (all form times are read/shown in this zone).
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` — the first admin account.
3. `npm run db:deploy` — applies the existing migration (schema **and the overlap-prevention
   constraint**). Use this rather than `db:migrate` / `prisma migrate dev`: `migrate dev` needs a
   shadow database, which hosted Postgres (Neon) often refuses. Only use `migrate dev` when you
   change `schema.prisma`, and set `shadowDatabaseUrl` if Neon rejects it.
4. `npm run db:seed` — creates the two spaces and the admin account.
5. `npm run dev` — http://localhost:3000

The database for this project is already provisioned (Neon project **faro-schedule**), migrated,
and seeded. `.env` is filled in locally (and git-ignored).

### Verify the overlap guarantee is in place

Run this against your database (Neon/Vercel dashboard SQL editor, or any client):

```sql
SELECT conname FROM pg_constraint WHERE conrelid = '"Appointment"'::regclass;
```

The result must include `appointment_no_overlap` and `appointment_time_order`. If it doesn't, the
constraint migration did not run — see the warning below.

The timezone helpers have an offline check: `npx tsx scripts/tz-check.mts`.

## Deploy to Vercel

1. `git init && git add -A && git commit -m "Initial commit"`, push to GitHub, import it in Vercel.
2. In the Vercel project, connect the existing Neon **faro-schedule** database (Storage tab →
   Neon → connect existing), or add the env vars by hand.
3. Set these env vars for Production (and Preview) — the same values as your local `.env`:
   `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `OFFICE_TZ`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
   `ADMIN_NAME`.
4. Set the **Build Command** to `prisma migrate deploy && prisma generate && next build` so each
   deploy applies pending migrations. (The DB is already migrated + seeded, so the first deploy is
   a no-op there.)

## Important: migrations only, never `db push`

The no-overlap guarantee lives in hand-written SQL inside
`prisma/migrations/20260905120000_init/migration.sql` (the `btree_gist` extension, the
`EXCLUDE USING gist` constraint, and the `CHECK` constraint). Prisma's schema language cannot
express these.

- Always evolve the database with `prisma migrate dev` / `prisma migrate deploy`.
- **Never run `prisma db push`** — it ignores migration SQL and would silently drop the constraint.
- When you create a new migration that touches `Appointment`, re-check that these constraints
  survive.

## Roles

| Role | Can do |
|---|---|
| **USER** | See all bookings; create bookings; cancel their own. |
| **ADMIN** | Everything a USER can, plus: approve/reject pending sign-ups, cancel anyone's booking. Cannot change roles or act on other ADMIN/SUPER_ADMIN accounts. |
| **SUPER_ADMIN** | Everything. The only role that can grant/revoke ADMIN (and SUPER_ADMIN). Cannot change its own role; `npm run db:seed` re-asserts the `ADMIN_EMAIL` account as SUPER_ADMIN every run, so it can never be locked out. |

## How access control works

- `middleware.ts` only does a coarse "is the user logged in?" check for page navigation.
- The real gate is `lib/auth-guard.ts` (`requireApprovedUser`, `requireAdmin`, `requireSuperAdmin`),
  which reloads the user from the database on every call so approvals/role changes take effect
  immediately.
- **Every server action calls one of these guards on its first line** — server actions are not
  covered by middleware.

## Known dependency advisories

`npm audit` reports transitive advisories in `postcss` (bundled inside `next`) and `deepmerge-ts`
(inside the `prisma` CLI, a dev dependency). Both are fixed only by major-version bumps of `next` /
`prisma`; neither is reachable in a way that affects this app at runtime. Revisit when upgrading.
