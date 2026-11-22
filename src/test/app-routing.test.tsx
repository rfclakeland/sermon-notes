import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("matches a shareable archive series URL", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const series = "Faith & Hope";
    const location = router.buildLocation({ to: "/archive", search: { series } });
    const history = createMemoryHistory({ initialEntries: [location.href] });
    const sharedRouter = createRouter({
      routeTree,
      history,
      context: { queryClient: new QueryClient() },
    });
    const { pathname, search } = sharedRouter.latestLocation;
    const matches = sharedRouter.matchRoutes(pathname, search);

    expect(new URLSearchParams(location.searchStr).get("series")).toBe(series);
    expect(matches.at(-1)).toMatchObject({ routeId: "/archive", search: { series } });
  });
});
