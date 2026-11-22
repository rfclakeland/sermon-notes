import { render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { demoSermons } from "@/lib/sermon/demo-data";
import { Route } from "@/routes/sermons.$sermonId";

const { useSermons } = vi.hoisted(() => ({ useSermons: vi.fn() }));

vi.mock("@/lib/sermon/queries", () => ({ useSermons }));
vi.mock("@/components/layout/SiteHeader", () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/reader/SermonReader", () => ({ SermonReader: () => null }));
vi.mock("@/components/reader/MoreSermons", () => ({ MoreSermons: () => null }));

afterEach(() => {
  vi.restoreAllMocks();
  document.head.replaceChildren();
});

it("updates the loading title and existing Open Graph title when the sermon loads", () => {
  const fallback = "Sermon notes — Restoration Notes";
  const ogTitle = document.createElement("meta");
  ogTitle.setAttribute("property", "og:title");
  ogTitle.content = fallback;
  document.head.append(ogTitle);
  document.title = fallback;

  const [sermon] = demoSermons();
  if (!sermon) throw new Error("Expected a demo sermon.");
  vi.spyOn(Route, "useParams").mockReturnValue({ sermonId: sermon.id });
  const SermonPage = Route.options.component!;
  useSermons.mockReturnValue({ isPending: true });
  const page = render(<SermonPage />);
  expect(document.title).toBe(fallback);

  useSermons.mockReturnValue({ isPending: false, data: { sermons: [sermon] } });
  page.rerender(<SermonPage />);
  expect(document.title).toBe(`${sermon.title} — Restoration Notes`);
  expect(ogTitle.content).toBe(document.title);

  page.unmount();
  expect(document.title).toBe(fallback);
  expect(ogTitle.content).toBe(fallback);
});
