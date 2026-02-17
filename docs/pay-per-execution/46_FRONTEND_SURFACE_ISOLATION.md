# Front-End Surface Isolation Audit (Sovereign Mode)

This document is a **production hardening record** for the Sovereign-only deployment.

Goal:
- When `SOVEREIGN_MODE=true`, the public-facing deployment must expose **only Sovereign surfaces**.
- All legacy/Global/Phoenix-Zero surfaces must be **fail-closed** (404) even via deep link, manual URL entry, browser back, or direct asset access.

---

## 0) Testing note (why `npm run start` failed)

`npm run start` was executed at the repo root (`d:\redessociaisvideo3s`) where there is **no** `start` script.

Use one of these:

- From repo root:

```powershell
$env:SOVEREIGN_MODE="true"
npm run start:web
```

- Or directly in the web app folder:

```powershell
cd apps/web
$env:SOVEREIGN_MODE="true"
npm run start
```

---

## 1) Sovereign public allow-list (intended public surface)

Only the following routes should be publicly reachable:

- `/`
- `/.well-known/*`
- `/api/pricing`
- `/api/capabilities`
- `/api/public/sovereign-signup`
- `/verify/*`

Everything else must be justified or blocked.

---

## 2) Enforcement mechanism

Authoritative enforcement lives in:

- `apps/web/src/middleware.ts`

When `SOVEREIGN_MODE=true`, the middleware returns **HTTP 404** for a set of blocked prefixes.

### 2.1 Blocked prefixes (fail-closed)

Current list (as implemented):

- `/api/phoenix-zero`
- `/api/global-`
- `/phoenix-zero-`
- `/global`
- `/ppe`
- `/demo`
- `/pricing`
- `/tools`
- `/agent-playground.html`
- `/playground.html`

### 2.2 Middleware matcher (critical)

Blocking only works if the middleware actually runs for the path.

Current matcher (as implemented):

- `/api/:path*`
- `/agent-playground.html`
- `/playground.html`
- `/phoenix-zero-:path*`
- `/ppe/:path*`
- `/pricing/:path*`
- `/global/:path*`
- `/demo/:path*`
- `/tools/:path*`

---

## 3) What was sealed (confirmed by code change)

### 3.1 `/ppe/*` (dark surface)

- Purpose: remove a “tutorial/commercial UI” surface from Sovereign public.
- Status: blocked by middleware + matcher.

Expected runtime behavior (`SOVEREIGN_MODE=true`):
- `GET /ppe` -> `404`
- `GET /ppe/anything` -> `404`

### 3.2 `/pricing/*` (legacy pricing wizard)

- Status: blocked by middleware + matcher.

Expected runtime behavior (`SOVEREIGN_MODE=true`):
- `GET /pricing` -> `404`
- `GET /pricing/observe` -> `404`

### 3.3 `/phoenix-zero-*` public assets

These assets exist physically under `apps/web/public`, so they are reachable by URL unless blocked.

- Status: blocked by middleware + matcher.

Expected runtime behavior (`SOVEREIGN_MODE=true`):
- `GET /phoenix-zero-sdk.v1.js` -> `404`
- `GET /phoenix-zero-embed.v1.js` -> `404`

---

## 4) Build artifact scan (what is normal vs what is a failure)

After a clean build (`rm -rf .next .next-win` + `npm run build`), it is **normal** for Next.js to generate static artifacts for routes such as:

- `.next-win/server/app/ppe.html`
- `.next-win/server/app/pricing/*.html`

This **does not** mean the route is reachable in Sovereign mode.

**Failure condition** is runtime reachability:
- If requesting `/ppe` or `/pricing/*` returns `200`, isolation failed.

---

## 5) Runtime verification checklist

Run the app with Sovereign mode enabled:

From repo root:

```powershell
$env:SOVEREIGN_MODE="true"
npm run start:web
```

Then validate these are `404`:

```powershell
curl.exe -I http://localhost:3000/ppe
curl.exe -I http://localhost:3000/ppe/anything
curl.exe -I http://localhost:3000/pricing
curl.exe -I http://localhost:3000/pricing/observe
curl.exe -I http://localhost:3000/phoenix-zero-sdk.v1.js
curl.exe -I http://localhost:3000/phoenix-zero-embed.v1.js
```

If testing against Render, replace `http://localhost:3000` with the production base URL.

---

## 6) “Legacy retention” rule (do not delete)

Isolation policy:
- **Do not delete** legacy pages/flows.
- Keep them as **dark surfaces** behind `SOVEREIGN_MODE=true`.

This preserves work for future reactivation while keeping Sovereign surfaces minimal.

---

## 7) How to re-enable legacy surfaces later (controlled rollback)

To re-enable a blocked surface (example: `/ppe`):

1) Edit `apps/web/src/middleware.ts`
- Remove `'/ppe'` from `blockedPrefixes`
- Remove `'/ppe/:path*'` from `config.matcher`

2) Rebuild & redeploy

3) Re-run the isolation audit

---

## 8) Known remaining non-allowlisted routes (decision required)

This document only seals the critical leaks already addressed.

If Sovereign public must be *strictly minimal* (allow-list only), consider also blocking (via the same pattern):

- `/creator`
- `/live-stream`
- `/verify-image`
- `/verify-image-wm`
- `/enterprise-demo`
- `/image-demo`
- `/image-demo-wm`
- `/live-embed-demo`

These are not automatically blocked by the current middleware unless they match an existing prefix.
