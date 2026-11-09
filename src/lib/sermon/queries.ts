import { queryOptions, useQuery } from "@tanstack/react-query";
import { publicSermons } from "./public";
import { sermonService } from "./service";

export type SermonScope = "public" | "staff";

export function sermonsQuery(scope: SermonScope = "public") {
  return queryOptions({
    queryKey: ["sermons", scope],
    queryFn: async () => {
      const data = await sermonService.list();
      if (scope === "public") return { ...data, sermons: publicSermons(data.sermons) };
      return data;
    },
    staleTime: 30_000,
    // Relative /api fetches run in the browser. The server render shows the skeleton.
    enabled: typeof window !== "undefined",
  });
}

export function useSermons(scope: SermonScope = "public") {
  return useQuery(sermonsQuery(scope));
}
