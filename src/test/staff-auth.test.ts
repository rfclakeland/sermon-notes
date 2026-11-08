import { describe, expect, it } from "vitest";
import { passwordsMatch, signSession, verifySession } from "@/server/auth";
import { createMemoryStore } from "@/server/store";
import { demoSermons } from "@/lib/sermon/demo-data";
import { ConflictError } from "@/lib/sermon/service";
import { publicSermons } from "@/lib/sermon/public";

describe("staff session", () => {
  it("accepts only the configured password and signs a cookie that does not contain it", async () => {
    expect(await passwordsMatch("correct horse", "correct horse")).toBe(true);
    expect(await passwordsMatch("wrong", "correct horse")).toBe(false);
    expect(await passwordsMatch("", "correct horse")).toBe(false);
    const token = await signSession("auth-secret-value", 60_000);
    expect(token).not.toContain("correct horse");
    expect(token).not.toContain("auth-secret-value");
    expect(await verifySession("auth-secret-value", token)).toBe(true);
    expect(await verifySession("other-secret", token)).toBe(false);
    expect(await verifySession("auth-secret-value", null)).toBe(false);
  });
});

describe("sermon store", () => {
  it("keeps drafts in the full collection and out of a public read", async () => {
    const store = createMemoryStore(demoSermons());
    const current = await store.list();
    const draft = {
      ...current.sermons[0]!,
      id: "evening-draft",
      title: "Evening draft",
      status: "draft" as const,
    };
    const saved = await store.save([draft, ...current.sermons], current.revision);
    expect(saved.sermons.some((sermon) => sermon.id === "evening-draft")).toBe(true);
    expect(publicSermons(saved.sermons).some((sermon) => sermon.id === "evening-draft")).toBe(
      false,
    );
    expect(saved.revision).toBe(current.revision + 1);
  });

  it("rejects a stale revision", async () => {
    const store = createMemoryStore(demoSermons());
    const current = await store.list();
    await expect(store.save(current.sermons, current.revision - 1)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
