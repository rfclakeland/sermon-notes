import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/sermons")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleList } = await import("@/server/api");
        return handleList(request);
      },
      POST: async ({ request }) => {
        const { handleSave } = await import("@/server/api");
        return handleSave(request);
      },
    },
  },
});
