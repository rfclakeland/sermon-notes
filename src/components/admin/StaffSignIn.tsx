import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { sermonService } from "@/lib/sermon/service";

export function StaffScreen({
  title,
  description,
  children,
  busy = false,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="rn staff-screen">
      <header className="app">
        <div className="wrap">
          <Link to="/" className="brand">
            <strong>Restoration Notes</strong>
          </Link>
        </div>
      </header>
      <main id="main" className="staff-main" aria-labelledby="staff-title" aria-busy={busy}>
        <section className="staff-panel">
          <h1 id="staff-title">{title}</h1>
          {description && <p className="staff-description">{description}</p>}
          {children}
        </section>
      </main>
    </div>
  );
}

export function StaffError({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <p className="staff-error" role="alert" tabIndex={-1} ref={ref}>
      {message}
    </p>
  );
}

export function StaffSignIn({
  emailLinks,
  onSignIn,
}: {
  emailLinks: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"password" | "link" | "sent">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const confirmation = useRef<HTMLDivElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "sent") confirmation.current?.focus();
    if (mode === "link") emailInput.current?.focus();
  }, [mode]);

  const changeMode = (next: typeof mode) => {
    setError("");
    setShow(false);
    setPassword("");
    setMode(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "link") {
        const result = await sermonService.requestSignInLink(email);
        setMessage(result.message);
        setMode("sent");
      } else {
        await onSignIn(email, password);
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Staff sign-in is temporarily unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (mode === "sent") {
    return (
      <StaffScreen title="Check your email">
        <div className="staff-confirmation" role="status" tabIndex={-1} ref={confirmation}>
          {message}
        </div>
        <button className="tbtn staff-secondary" onClick={() => changeMode("password")}>
          Back to sign in
        </button>
      </StaffScreen>
    );
  }

  const withPassword = mode === "password";
  const action = withPassword
    ? { label: "Sign in", busy: "Signing in…" }
    : { label: "Send sign-in link", busy: "Sending…" };
  return (
    <StaffScreen
      title={withPassword ? "Sign in with your RFC account" : "Get a sign-in link"}
      description={
        withPassword
          ? "Use the same account as the RFC Media Portal."
          : "Enter your RFC account email address to request a one-time link."
      }
    >
      <form className="staff-form" onSubmit={submit} aria-busy={busy}>
        <div>
          <label htmlFor="staff-email">Email</label>
          <input
            ref={emailInput}
            id="staff-email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={busy}
            required
          />
        </div>
        {withPassword && (
          <div>
            <label htmlFor="staff-password">Password</label>
            <div className="staff-password">
              <input
                id="staff-password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                readOnly={busy}
                required
              />
              <button
                type="button"
                className="tbtn"
                aria-label={show ? "Hide password" : "Show password"}
                aria-controls="staff-password"
                onClick={() => setShow(!show)}
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        )}
        <StaffError message={error} />
        <button className="tbtn primary" disabled={busy}>
          {busy ? action.busy : action.label}
        </button>
        {emailLinks && (
          <button
            type="button"
            className="tbtn staff-secondary"
            disabled={busy}
            onClick={() => changeMode(withPassword ? "link" : "password")}
          >
            {withPassword ? "Email me a sign-in link" : "Use a password instead"}
          </button>
        )}
      </form>
    </StaffScreen>
  );
}
