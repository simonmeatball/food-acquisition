# FAQ - Food Acquisition

A responsive food-poll and meal-feedback app. Vercel serves the static site and its `/api` serverless functions; Neon provides shared Postgres storage, so polls, named votes, guest profiles, meals, reviews, and statistics are available across devices.

## Deploy to Vercel

1. Push this project to a Git repository and import it in Vercel.
2. In the Vercel Marketplace, add Neon Postgres and connect it to the same Vercel project, or use an existing Neon project.
3. In the Vercel project settings, make sure a Postgres connection variable is enabled for **Production**; also enable **Preview** and **Development** if you use those environments. The API accepts `DATABASE_URL`, `FOOD_ACQUISITION_DB_POSTGRES_URL`, `FOOD_ACQUISITION_DB_POSTGRES_PRISMA_URL`, `FOOD_ACQUISITION_DB_POSTGRES_URL_NON_POOLING`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, or `POSTGRES_URL_NON_POOLING`. For your Neon integration, `FOOD_ACQUISITION_DB_POSTGRES_URL` is supported directly. Do not use the `NEXT_PUBLIC_` prefix, expose the value in browser code, or commit it.
4. Deploy or redeploy after connecting the database or changing the environment variable. Vercel only makes new environment variable values available to new deployments.
5. Verify the production API at `https://your-site.vercel.app/api/polls`. A new database should return `[]`. `https://your-site.vercel.app/api/responses` should return `{"count":0}`. The API creates and migrates its tables on the first request; `db/schema.sql` contains the equivalent schema for manual setup.

If the app says it cannot connect to the database, check that one of the supported variables exists in the correct Vercel project and environment, then redeploy. If the API still returns an error, inspect the Vercel Function logs for the request.

The example polls are only shown when opening the HTML file directly with a `file://` URL. A deployed app does not use those examples; it loads the saved polls from Neon.

No build command is needed; `index.html` is served as a static file and files in `api/` are deployed as Vercel Functions.

## Local development

Use Node.js 22.12 or newer. Install dependencies with `npm install`, then run `npx vercel dev` (there is intentionally no `npm run dev` script because it recursively invokes the Vercel CLI). Configure `DATABASE_URL` in `.env.local` to use the shared backend. When opened directly as a `file://` URL, the page uses browser-local storage as a visual/local prototype; use the Vercel dev server for API-backed behavior.

## API

- `GET /api/polls`, `POST /api/polls`
- `GET /api/poll?id=...`, `PATCH /api/poll?id=...`, `DELETE /api/poll?id=...`
- `POST /api/vote?id=...`
- `GET /api/meals`, `POST /api/meals`
- `GET /api/responses`, `POST /api/responses`
- `GET /api/stats`

## Polls, meals, and statistics

Voters must enter a name. A name can vote once per poll, and the poll view shows who has voted. To see who has not voted yet, add the expected names as a comma-separated list when creating the poll; without a list of expected voters the app can only show submitted voters.

The app keeps the current guest name in browser local storage and pre-fills it on that device. The server groups names by a normalized key (case-insensitive, with extra spaces collapsed), so entering the same name on another device links poll votes, poll authorship, and meal feedback to the same guest profile. Polls record their creator; edit, close/reopen, and delete controls are shown to the matching creator name.

Polls created before creator tracking was added have no recorded owner, so their existing votes remain visible but owner controls are unavailable for those older polls.

Meal feedback must be attached to a meal record. Create a meal directly from the feedback page, or open a poll and create a meal linked to that poll. The Statistics page groups feedback by person and meal, including meals attended, the sum of the 1–10 intake scores, spending, and average food ratings. The intake score is a self-reported scale, not a measured calorie count.

The public poll, voting, meal creation, and feedback endpoints accept submissions without an account, as intended for event guests. Add authentication or rate limiting before using the app for sensitive data or a high-traffic public event.

Because guest profiles are name-based and have no authentication, they are convenient attribution rather than verified identities. Anyone who enters the same name can appear as that guest and can use that name to manage its polls. Do not treat poll ownership as a security boundary.
