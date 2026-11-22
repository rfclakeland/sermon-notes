import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StaffError, StaffScreen } from "@/components/admin/StaffSignIn";
import { sermonService, StaffAuthError } from "@/lib/sermon/service";

export const Route = createFileRoute("/login/link")({
  head: () => ({
    meta: [
      { title: "Sign-in link — Restoration Notes" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SignInLink,
});

function SignInLink() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signIn = async () => {
    setBusy(true);
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    window.history.replaceState(window.history.state, "", window.location.pathname);
    try {
      await sermonService.consumeSignInLink(token);
      queryClient.removeQueries({ queryKey: ["sermons", "staff"] });
      await navigate({ to: "/admin", replace: true });
    } catch (error) {
      setError(
        error instanceof StaffAuthError ? error.message : "Couldn’t open this sign-in link.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <StaffScreen title="Sign in to Restoration Notes">
      <StaffError message={error} />
      {error ? (
        <Link to="/admin" className="tbtn staff-secondary staff-action">
          Back to sign in
        </Link>
      ) : (
        <button className="tbtn primary staff-action" onClick={signIn} disabled={busy}>
          {busy ? "Signing in…" : "Continue to Notes"}
        </button>
      )}
    </StaffScreen>
  );
}
