import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleLogin } = await import("@/server/api");
        return handleLogin(request);
      },
    },
  },
});
