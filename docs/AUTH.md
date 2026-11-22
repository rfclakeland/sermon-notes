# Staff sign-in

Restoration Notes uses the same RFC accounts as the Media Portal. The `AUTH_DB` binding points to the church’s `rfc-church` D1 database. The `DB` binding stores sermon content in the Notes preview database. Covers use the Notes `COVERS` bucket.

The Worker verifies RFC passwords using the platform’s PBKDF2 hashes. The `__Host-rfc_session` cookie holds a random token. D1 stores its HMAC hash, and signing out revokes the current session. The Worker reads effective permissions for the `notes` app on each staff request. Individual denies override role permissions.

| Permission             | What it allows                                               |
| ---------------------- | ------------------------------------------------------------ |
| `notes.access`         | Enter the Notes staff area                                   |
| `notes.sermons.view`   | List and preview drafts                                      |
| `notes.sermons.edit`   | Save the sermon collection and upload covers                 |
| `notes.sermons.delete` | Remove a stored sermon, including through an imported backup |
| `notes.admin`          | Identify the Notes admin role for future admin features      |

Both built-in roles can view, edit, and delete. The admin role also has `notes.admin`. The migration creates roles and permissions without assigning them to anyone.

Email links expire after 20 minutes and can be used once. Only active accounts with `notes.access` are eligible. The link opens a confirmation page, where the user chooses to sign in. Each platform account can have one outstanding link across RFC apps, so a newly issued Notes link supersedes an older link.

## Preview setup with owner approval

The owner performs these steps after approving the preview’s access to `rfc-church`. A D1 binding gives the preview Worker read-write access to the entire production church database. The Notes auth code uses only `platform_*` tables and writes session, link, and rate-limit rows there. Keep the binding out of the checked-in default configuration until approved.

1. Apply the Notes permission migration to the church database.

   ```sh
   npx wrangler d1 execute rfc-church --remote --file platform/migrations/0001_notes_permissions.sql
   ```

2. Copy `platform/grant-notes-role.sql.example` to a private file, substitute the owner’s existing RFC email for `REPLACE_WITH_EMAIL`, and select the role. Run it against `rfc-church`. The grant is idempotent and leaves the database unchanged when the address has no account. Use `platform/verify-notes-permissions.sql` with the same substitution to check the role, active status, and effective permissions.

   ```sh
   npx wrangler d1 execute rfc-church --remote --file /path/to/private-grant.sql
   npx wrangler d1 execute rfc-church --remote --file /path/to/private-verify.sql
   ```

3. Add this object to the preview Worker’s `d1_databases` list in `wrangler.jsonc`, alongside the existing `DB` entry. Leave `migrations_dir` off the identity binding.

   ```json
   {
     "binding": "AUTH_DB",
     "database_name": "rfc-church",
     "database_id": "3ff6d525-273f-4ce0-9fa2-fc5ddd745483"
   }
   ```

   Set `AUTH_SECRET` using `npx wrangler secret put AUTH_SECRET`. Use a randomly generated secret of at least 32 characters, dedicated to this preview. Keep the value out of source control. `APP_ORIGIN` must be the exact HTTPS origin, without a trailing slash. The checked-in value is `https://restoration-notes.media-ff8.workers.dev`.

   For email links, the Worker uses the optional `AUTH_MAILER` send_email binding and `AUTH_FROM_ADDRESS`. The preview config allows `media@rfclakeland.com`. Use an enabled Cloudflare sender at `rfclakeland.com`. The password form works without mail configuration.

4. Rebuild and redeploy the preview with the approved bindings. Verify sign-in and sign-out, and confirm unpublished sermons require an authorized staff session.
5. Delete the obsolete preview secret with `npx wrangler secret delete STAFF_PASSWORD`.

The Media Portal’s passkey RP ID is `rfclakeland.com`. The current `workers.dev` origin falls outside that RP ID. Passkeys are a follow-up for a Notes subdomain. Sharing a browser session without a second sign-in would require an RFC subdomain such as `notes.rfclakeland.com`, an RFC-wide cookie domain and compatible cookie name, and a shared `AUTH_SECRET`.

## Local identity and sample sermons

`npm run dev` serves the sample outlines and the disconnected staff screen. To run staff sign-in locally with Wrangler and two disposable emulated D1 databases, copy `.dev.vars.example` to `.dev.vars` and set a local-only `AUTH_SECRET`. Then run:

```sh
npm run dev:auth:seed
npm run build
npm run dev:auth
```

Open `https://127.0.0.1:8787/admin` and accept Wrangler’s local certificate. The local config enables Miniflare’s email emulator. Local link requests use the fixture DB and the emulator, and any mail is kept on the local machine. Both databases persist in `.wrangler/notes-auth`. The seed script can be run again and preserves existing local passwords. The Worker seeds the existing sample sermons on its first content read.

The local fixture password is `local-demo-password` for these fictional accounts:

| Email                   | Access                          |
| ----------------------- | ------------------------------- |
| `editor@example.com`    | Notes admin                     |
| `volunteer@example.com` | Media volunteer                 |
| `denied@example.com`    | Notes editor with an edit deny  |
| `nodelete@example.com`  | Notes editor with a delete deny |

The fixture contains the platform DDL from identity migrations 0004 and 0005, plus fictional accounts. The tests load the same schema into in-memory SQLite with Node 22 or later.

`src/server/platform-auth/index.js` is sourced from `rfclakeland/rfc-digital-platform` at `8e28225`. Keep it in sync until extracted into a shared package. The Notes adapter passes an optional permission to the vendored link-issuance function so eligibility is checked before creating a link and again at delivery.
