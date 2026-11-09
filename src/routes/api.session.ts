import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleSession } = await import("@/server/api");
        return handleSession(request);
      },
    },
  },
});
