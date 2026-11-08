# Dus Chat

A private, two-person chat web app. Black theme, realtime messages, and no custom backend — Supabase handles auth, database, realtime, and file storage.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Supabase (Auth, Postgres, Realtime, Storage)
- Cloudflare Pages (free hosting via GitHub Actions)

## Features

- Username login (username min. 3 chars, password min. 6 chars — Supabase does not accept less than 6)
- Realtime text, code snippets (with syntax highlighting + copy), images, and files of any type (PDF, ZIP, audio, video, documents — 10 MB max)
- `.txt` viewer popup with copy and download — only `.txt` files open in the popup; other files download on tap
- Per-message copy and reply; edit and delete your own messages (edits are marked "(edited)")
- Typing indicator and online presence for the other user
- Client-side search with highlighted matches and jump-to-message
- Image lightbox, offline indicator, infinite scroll (50 messages per page) with a "↓ New messages" pill when scrolled up
- One-click "Delete all chats" from Settings — removes all messages and files for both users
- Fully responsive, black theme on every screen size

## Two-user limit

Dus Chat is for personal use by exactly two people. Signup is capped at two accounts — the check is enforced in the database (see the migration), not just in the UI, so a third account cannot be created via the API either.

## Sessions, security notes, and accepted tradeoffs

- **Cookie sessions (not localStorage).** The Supabase session is stored in a `dus-chat-auth` cookie (`Max-Age` 7 days, `Path=/`, `SameSite=Lax`, `Secure` only on https). Honest tradeoff: a JavaScript-set cookie cannot be `httpOnly`, so this does **not** stop XSS token theft — any script on the page can read `document.cookie`, exactly as it could read localStorage. It buys `Secure` + `SameSite=Lax` + a bounded 7-day lifetime instead of an indefinite localStorage session. True `httpOnly` storage needs a server or edge function, which is out of scope for this no-backend app — so do not treat the cookie as a security improvement over localStorage against XSS.
- **One-time logout.** The deploy that switches storage to cookies deletes the legacy localStorage session key (`sb-<project-ref>-auth-token`) on first load, so both users are logged out once and must log in again. Expected and accepted.
- **Username → email lookup (C5).** Login is by username, but Supabase Auth signs in by email, so the app resolves username → email via the unauthenticated `get_email_by_username` RPC — anyone can check whether a username exists. That is by design for a no-backend username login. Mitigations are generic login errors (no "wrong password vs unknown user" distinction in the UI) and Supabase Auth's built-in rate limiting. A real fix needs a backend or edge function.
- **Storage policies (C2).** The `chat-files` bucket policies are bucket-wide (`bucket_id = 'chat-files'`), so either user can technically delete the other's files. This is deliberate: delete-all removes **both** users' files through the client (a scoped DELETE policy would break it), and viewing the other user's attachments needs a bucket-wide SELECT policy anyway. Both users are trusted — this is a private two-person app — so the broad policies are an accepted risk. See the comment in `src/lib/supabase.ts`.
- **Security headers.** `public/_headers` (served by Cloudflare Pages) sets `nosniff`, `DENY` framing, a strict CSP, HSTS, and immutable caching for `/assets/*`. The CSP allows `style-src 'unsafe-inline'` because the code highlighter and Tailwind v4 use inline styles, and `connect-src` must include both `https://*.supabase.co` and `wss://*.supabase.co` or realtime goes dark.

## Performance notes

- Messages load 50 at a time with keyset pagination (`created_at`, `id`) and infinite scroll; scroll position is preserved when older pages prepend.
- Profiles are fetched once per session in `AuthContext` and shared via context; signed file URLs are cached per path (1 hour) with in-flight deduping; no `select('*')` in hot paths.
- The Chat page is lazy-loaded and the bundle is split (`vendor` / `supabase` / `highlighter` chunks); `date-fns` was replaced by a tiny hand-rolled formatter in `src/lib/format.ts`.

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
