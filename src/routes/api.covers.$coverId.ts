import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/covers/$coverId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleCoverGet } = await import("@/server/api");
        return handleCoverGet(request, params.coverId);
      },
    },
  },
});
