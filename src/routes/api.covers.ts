import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/covers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCoverUpload } = await import("@/server/api");
        return handleCoverUpload(request);
      },
    },
  },
});
