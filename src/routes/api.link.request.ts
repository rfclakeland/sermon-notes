import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/link/request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleLinkRequest } = await import("@/server/auth");
        return handleLinkRequest(request);
      },
    },
  },
});
