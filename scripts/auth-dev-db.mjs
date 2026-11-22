import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../src/server/platform-auth/index.js";

const root = new URL("../", import.meta.url);
const scratch = await mkdtemp(join(tmpdir(), "notes-auth-"));
const password = "local-demo-password";

function execute(binding, file) {
  execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      binding,
      "--local",
      "--config",
      "wrangler.local.jsonc",
      "--persist-to",
      ".wrangler/notes-auth",
      "--file",
      file,
    ],
    {
      cwd: fileURLToPath(root),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "inherit",
    },
  );
}

try {
  const fixtureFiles = [
    "platform/fixtures/platform-schema.sql",
    "platform/migrations/0001_notes_permissions.sql",
    "platform/fixtures/users.sql",
  ];
  const sql = await Promise.all(fixtureFiles.map((file) => readFile(new URL(file, root), "utf8")));
  for (const id of ["editor", "volunteer", "denied", "no-delete"]) {
    const hash = await hashPassword(password);
    sql.push(`INSERT OR IGNORE INTO platform_passwords(user_id, password_hash, updated_at)
      VALUES ('fixture-${id}', '${hash}', unixepoch());`);
  }
  const identity = join(scratch, "identity.sql");
  await writeFile(identity, sql.join("\n"), { mode: 0o600 });
  execute("AUTH_DB", identity);
  execute("DB", "migrations/0001_init.sql");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
