import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { sermonService } from "@/lib/sermon/service";

type S = "loading" | "in" | "out";

export function useAdminSession() {
  const [status, setStatus] = useState<S>("loading");
  const queryClient = useQueryClient();
  useEffect(() => {
    sermonService.session().then((session) => setStatus(session.authenticated ? "in" : "out"));
  }, []);
  return {
    status,
    signIn: async (password: string) => {
      const ok = await sermonService.login(password);
      if (ok) {
        setStatus("in");
        await queryClient.invalidateQueries({ queryKey: ["sermons"] });
      }
      return ok;
    },
    signOut: async () => {
      await sermonService.logout();
      setStatus("out");
      await queryClient.invalidateQueries({ queryKey: ["sermons"] });
    },
  };
}

function SignIn({ onSignIn }: { onSignIn: (password: string) => Promise<boolean> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const ok = await onSignIn(password);
    setBusy(false);
    if (!ok) setError("That password wasn’t recognized.");
  };
  return (
    <div className="rn">
      <header className="app">
        <div className="wrap">
          <Link to="/" className="brand">
            <strong>Restoration Notes</strong>
            <span>Restoration Fellowship · Lakeland</span>
          </Link>
        </div>
      </header>
      <main id="main">
        <div className="wrap">
          <header className="page-head">
            <p className="eyebrow">Church staff</p>
            <h1>Staff sign in</h1>
            <p className="lede">
              Staff prepare sermon outlines here. Visitors don’t need an account, and their notes
              stay in the browser.
            </p>
          </header>
          <form className="staff-form" onSubmit={submit}>
            <input
              className="sr-only"
              type="text"
              name="username"
              autoComplete="username"
              defaultValue="staff"
              tabIndex={-1}
            />
            <label htmlFor="pw">Password</label>
            <input
              id="pw"
              type="password"
              autoComplete="current-password"
              className="search"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              className="tbtn primary"
              style={{ marginTop: 18 }}
              disabled={busy}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export function AdminGate({ children }: { children: (signOut: () => void) => ReactNode }) {
  const session = useAdminSession();
  if (session.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        <p className="text-[15px] text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (session.status === "out") return <SignIn onSignIn={session.signIn} />;
  return <>{children(session.signOut)}</>;
}
