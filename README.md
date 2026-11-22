# Restoration Notes

Sermon outlines for Restoration Fellowship Church of Lakeland. Visitors fill in the blanks in the browser. Notes stay on that device. Staff sign in from the footer to draft and publish outlines.

This repository is a **preview**. It is not the live church website.

- Do not attach a custom domain.
- Do not change DNS for `rfclakeland.com`.
- Do not change Microsoft 365 mail.
- Sermon content uses the preview D1 database `restoration-notes-preview`. Staff identities use a separate binding to the church’s `rfc-church` database after owner approval.

## Preview content

The ten sermons are **sample outlines**, not recordings of Restoration Fellowship services. The speaker on every sample is “Pastor.” Scripture is a reference plus a Bible Gateway link. The passage text is not embedded.

## Staff sign-in

Staff use their RFC account password or a one-time email link. See [Staff sign-in](docs/AUTH.md) for preview setup, permissions, and a local identity database with fictional accounts.

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
