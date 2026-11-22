# Builder publishing

ProPresenter Builder sends sermon notes to `POST /api/builder/publish` on the Restoration Notes Worker.

## Request

Send `Authorization: Bearer <shared secret>` and `Content-Type: application/json`. The body is a
UTF-8 JSON object with these fields.

```json
{
  "id": "builder-00000000-0000-0000-0000-000000000001-2040-02-29",
  "title": "Example sermon",
  "date": "2040-02-29",
  "speaker": "Example speaker",
  "scripture": "Mark 2:1–12",
  "content": {
    "ops": [
      { "insert": "An example " },
      { "insert": { "blank": { "id": "b-1", "answer": "outline", "multiline": false } } },
      { "insert": "\n" }
    ]
  }
}
```

Use a real calendar date in `YYYY-MM-DD` form. The ID is `builder-<project UUID>-<date>` and
includes the same date and a lowercase UUID in 8-4-4-4-12 format. The title and at least one
text insert must contain visible text. The body limit is 256 KiB, and the delta may contain up
to 5,000 operations with unique blank IDs. String inserts and blank embeds are supported.
The server strips unsupported formatting attributes, ignores top-level fields outside the
request contract, and sets the new sermon’s status to published.

The largest Builder-shaped payload measured across the 257 imported archive sermons was
8,355 UTF-8 bytes. The largest outline had 162 operations.

## Responses

Every response has `Cache-Control: no-store`. Successful responses return the receipt
`{ "id": "<id>", "url": "<PUBLIC_ORIGIN>/sermons/<id>" }`. Errors return a JSON object
with an `error` string, apart from the empty method rejection.

| Status                     | Code or header        | Meaning                                                                                                                                                |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 201 Created                |                       | A new public sermon was created.                                                                                                                       |
| 200 OK                     |                       | The same validated Builder fields already exist for the ID. The receipt is the same and the stored sermon is preserved, including any staff additions. |
| 400 Bad Request            |                       | The JSON, sermon fields, or delta are invalid.                                                                                                         |
| 401 Unauthorized           |                       | The bearer credentials are missing, malformed, or incorrect.                                                                                           |
| 405 Method Not Allowed     | `Allow: POST`         | The endpoint accepts POST. The response body is empty.                                                                                                 |
| 409 Conflict               | `code: "id_conflict"` | The ID is already stored with different Builder-owned fields.                                                                                          |
| 409 Conflict               | `code: "date_taken"`  | A different sermon or draft already uses this date.                                                                                                    |
| 413 Content Too Large      |                       | The body exceeds 256 KiB.                                                                                                                              |
| 415 Unsupported Media Type |                       | The request needs `Content-Type: application/json`.                                                                                                    |
| 500 Internal Server Error  |                       | An unexpected storage or publishing failure occurred.                                                                                                  |
| 503 Service Unavailable    |                       | The Notes Worker needs a publish token or valid public origin. The error is `Publishing is not configured.`                                            |
| 503 Service Unavailable    | `Retry-After: 2`      | The collection changed during all three insert attempts. Retry the same request after two seconds.                                                     |

Builder treats both 409 codes as permanent conflicts. The fields compared on a retry are
`id`, `title`, `date`, `speaker`, `scripture`, and `content`, after validation and normalization.
A retry leaves staff changes in place.

## Worker configuration

### Notes Worker (`restoration-notes`)

- Set `BUILDER_PUBLISH_TOKEN` as a secret shared with Builder.
- Set the non-secret `PUBLIC_ORIGIN` variable to
  `https://restoration-notes.media-ff8.workers.dev` in preview and
  `https://notes.rfclakeland.com` in production. Use an HTTPS origin with no path, query,
  fragment, or credentials. Development and tests can use a configured `http://localhost` origin.

```sh
wrangler secret put BUILDER_PUBLISH_TOKEN
```

### Builder Worker

- Set `NOTES_PUBLISH_TOKEN` to the same secret value as `BUILDER_PUBLISH_TOKEN`.
- Set `NOTES_PUBLISH_ORIGIN` to the Notes Worker origin Builder should call.
- Set `REBRANDLY_API_KEY` for shortened links and optionally `REBRANDLY_WORKSPACE` to select a workspace.

```sh
wrangler secret put NOTES_PUBLISH_TOKEN
wrangler secret put NOTES_PUBLISH_ORIGIN
wrangler secret put REBRANDLY_API_KEY
wrangler secret put REBRANDLY_WORKSPACE
```

Run each secret command in its Worker’s project. Enter the value at the prompt and keep it
out of source control.

## Acceptance test on one unused date

1. In the target Notes Worker’s staff view, pick an unused date and confirm it has no published sermon or draft.
2. In Builder, create an example outline with a title, a scripture reference, and a fill-in blank. Publish it for that date. Confirm the Notes Worker returns `201` and the receipt has the expected `PUBLIC_ORIGIN` and `/sermons/<id>` path.
3. Open the returned link as a visitor. Confirm the title, date, and outline are visible and the blank accepts input.
4. Repeat the same publication using the same Builder project and date. Confirm a `200` with the same receipt and one sermon on that date.
5. Add a cover or series to the sermon in the staff editor. Repeat the same Builder publication and verify the receipt and staff additions are still present. Publishing a separate Builder project for that date should return `409 date_taken`.

## Imported archive

Imported sermons keep their WordPress slug IDs and links such as `/sermons/paid-in-full`.
Builder IDs use `builder-<uuid>-<date>` and open at `/sermons/<id>`. Builder can publish one
sermon per date. Every existing sermon on that date, including an imported sermon or a draft,
occupies the date.
