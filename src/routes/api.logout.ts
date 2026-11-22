import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleLogout } = await import("@/server/auth");
        return handleLogout(request);
      },
    },
  },
});
