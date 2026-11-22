import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  sermonService,
  StaffAuthError,
  type StaffIdentity,
  type StaffSession,
} from "@/lib/sermon/service";
import { StaffError, StaffScreen, StaffSignIn } from "./StaffSignIn";

export type AdminSession = StaffIdentity & {
  onSignOut: () => void;
  signingOut: boolean;
};

const NO_ACCESS = "Your RFC account doesn’t have Notes editor access. Ask an administrator.";

export function AdminGate({ children }: { children: (session: AdminSession) => ReactNode }) {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const queryClient = useQueryClient();

  const refresh = async () => {
    setSessionError("");
    try {
      setSession(await sermonService.session());
    } catch {
      setSessionError("Couldn’t check your staff sign-in.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    sermonService.session().then(
      (result) => {
        if (!cancelled) setSession(result);
      },
      () => {
        if (!cancelled) setSessionError("Couldn’t check your staff sign-in.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      await sermonService.login(email, password);
    } catch (error) {
      if (error instanceof StaffAuthError && (error.status === 403 || error.status === 503)) {
        setSession({ status: error.status === 403 ? "no-access" : "not-connected" });
        return;
      }
      throw error;
    }
    queryClient.removeQueries({ queryKey: ["sermons", "staff"] });
    await refresh();
  };

  const signOut = async () => {
    setSigningOut(true);
    setSessionError("");
    try {
      await sermonService.logout();
      setSession(null);
      await queryClient.cancelQueries({ queryKey: ["sermons", "staff"] });
      queryClient.removeQueries({ queryKey: ["sermons", "staff"] });
      await refresh();
    } catch {
      setSessionError("Couldn’t sign out. Try again.");
    } finally {
      setSigningOut(false);
    }
  };

  if (!session) {
    return (
      <StaffScreen
        title={sessionError ? "Staff sign-in is unavailable" : "Checking staff sign-in…"}
        busy={!sessionError}
      >
        {sessionError && (
          <>
            <StaffError message={sessionError} />
            <button className="tbtn staff-secondary" onClick={refresh}>
              Try again
            </button>
          </>
        )}
      </StaffScreen>
    );
  }
  if (session.status === "not-connected") {
    return (
      <StaffScreen
        title="Staff sign-in isn’t connected yet"
        description="An administrator needs to connect Restoration Notes to RFC accounts."
      />
    );
  }
  if (session.status === "no-access") {
    return (
      <StaffScreen title="Notes editor access required" description={NO_ACCESS}>
        <StaffError message={sessionError} />
        <button className="tbtn primary staff-action" onClick={signOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </StaffScreen>
    );
  }
  if (session.status === "signed-out") {
    return <StaffSignIn emailLinks={session.emailLinks} onSignIn={signIn} />;
  }
  return (
    <>
      {sessionError && (
        <p className="px-5 py-2 text-destructive" role="alert">
          {sessionError}
        </p>
      )}
      {children({ ...session.identity, onSignOut: signOut, signingOut })}
    </>
  );
}
