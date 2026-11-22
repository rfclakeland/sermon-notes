import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/link/consume")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleLinkConsume } = await import("@/server/auth");
        return handleLinkConsume(request);
      },
    },
  },
});
