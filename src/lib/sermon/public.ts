import type { Sermon } from "./types";

/** Visitors only see sermons whose status was set to published. */
export function publicSermons(sermons: Sermon[]) {
  return sermons.filter((s) => s.status === "published");
}
