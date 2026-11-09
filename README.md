# Restoration Notes

Sermon outlines for Restoration Fellowship Church of Lakeland. Visitors fill in the blanks in the browser. Notes stay on that device. Staff sign in from the footer to draft and publish outlines.

This repository is a **preview**. It is not the live church website.

- Do not attach a custom domain.
- Do not change DNS for `rfclakeland.com`.
- Do not change Microsoft 365 mail.
- The database is a new preview D1 database named `restoration-notes-preview`. It is not the church `rfc-church` database.

## Preview content

The ten sermons are **sample outlines**, not recordings of Restoration Fellowship services. The speaker on every sample is “Pastor.” Scripture is a reference plus a Bible Gateway link. The passage text is not embedded.

## Staff secrets

Set these on the preview Worker. Do not commit the values.

- `AUTH_SECRET` — signs the HttpOnly session cookie
- `STAFF_PASSWORD` — staff sign-in password

```sh
npx wrangler secret put AUTH_SECRET
npx wrangler secret put STAFF_PASSWORD
```

For local Wrangler, copy `.dev.vars.example` to `.dev.vars`.

## Develop

```sh
npm install
npm run dev
npm test
```

`npm run dev` keeps sermons in memory and seeds the sample outlines. A deployed Worker uses D1. Uploaded covers go to the preview R2 bucket `restoration-notes-preview-covers`. The sample photographs are static files in `public/covers`.

## Deploy the workers.dev preview

```sh
npx wrangler d1 migrations apply restoration-notes-preview --remote
npm run deploy
```

The first request seeds the sample sermons when the database is empty and has not been seeded before. No custom domain is configured.
