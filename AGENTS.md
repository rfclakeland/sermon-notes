## Project rules
- UI talks only to the `SermonService` interface in `src/lib/sermon/service.ts`; the prototype uses the local demo adapter, production swaps in `http-service.ts` (keeps Cloudflare API contract isolated).
- Sermon documents persist as the delta-style `{ops}` format; Tiptap JSON is editor-only state converted via `tiptap-adapter.ts` (keeps existing D1 data and blank IDs compatible).
