import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/builder/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleBuilderPublish } = await import("@/server/api");
        return handleBuilderPublish(request);
      },
    },
  },
});
