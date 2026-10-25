# FAQ - Food Acquisition

A responsive food-poll and meal-feedback app. Vercel serves the static site and its `/api` serverless functions; Neon provides shared Postgres storage, so polls, votes, and reviews are available across devices.

## Deploy to Vercel

1. Push this project to a Git repository and import it in Vercel.
2. Add a Neon Postgres database through the Vercel Marketplace (or use an existing Neon project).
3. Set `DATABASE_URL` in the Vercel project settings to the database's pooled connection string. Do not expose it in browser code or commit it.
4. Deploy. The API creates its tables on the first request. `db/schema.sql` contains the equivalent schema for manual setup.

No build command is needed; `index.html` is served as a static file and files in `api/` are deployed as Vercel Functions.

## Local development

Install dependencies with `npm install`, then run `npm run dev`. Configure `DATABASE_URL` in `.env.local` to use the shared backend. When opened directly as a `file://` URL, the page uses browser-local storage as a visual/local prototype; use the Vercel dev server for API-backed behavior.

## API

- `GET /api/polls`, `POST /api/polls`
- `GET /api/poll?id=...`, `PATCH /api/poll?id=...`
- `POST /api/vote?id=...`
- `GET /api/responses`, `POST /api/responses`

The public voting and review endpoints accept submissions without an account, as intended for event guests. Add authentication or rate limiting before using the app for sensitive data or a high-traffic public event.
