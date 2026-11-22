import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/builder/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleBuilderPublish } = await import("@/server/builder-publish");
        return handleBuilderPublish(request);
      },
      ANY: () =>
        new Response(null, {
          status: 405,
          headers: { Allow: "POST", "Cache-Control": "no-store" },
        }),
    },
  },
});
