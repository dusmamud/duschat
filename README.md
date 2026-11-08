# Dus Chat

A private, two-person chat web app. Black theme, realtime messages, and no custom backend — Supabase handles auth, database, realtime, and file storage.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Supabase (Auth, Postgres, Realtime, Storage)
- Cloudflare Pages (free hosting via GitHub Actions)

## Features

- Username login (username min. 3 chars, password min. 6 chars — Supabase does not accept less than 6)
- Realtime text, code snippets (with syntax highlighting + copy), images, and `.txt` files
- `.txt` viewer popup with copy and download
- Per-message copy and reply
- One-click "Delete all chats" from Settings — removes all messages and files for both users
- Fully responsive, black theme on every screen size

## Two-user limit

Dus Chat is for personal use by exactly two people. Signup is capped at two accounts — the check is enforced in the database (see the migration), not just in the UI, so a third account cannot be created via the API either.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase SQL Editor, run `supabase/migrations/001_init.sql` from this repo. It creates the `profiles` and `messages` tables, the `chat-files` storage bucket, Row Level Security policies, Realtime, and the two-user limit.
3. In Supabase Dashboard → Authentication → Providers → Email, turn **Confirm email** off (personal use, no email verification needed).
4. In Authentication → Password settings, set the minimum password length to **6**. Supabase does not accept less than 6, so a 3-character password will be rejected at signup.
5. Copy the project URL and anon (publishable) key from Dashboard → Settings → API. Never use the `service_role` key in the frontend.

## Local development

```bash
npm install
cp .env.example .env   # then fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Required variables in `.env`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

## Deploy

Push to `main` — the GitHub Actions workflow in `.github/workflows/deploy.yml` builds the app and deploys `dist/` to Cloudflare Pages as `duschat.pages.dev`.

Set these secrets in GitHub → Settings → Secrets and variables → Actions:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
