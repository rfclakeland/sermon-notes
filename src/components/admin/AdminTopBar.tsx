import { Link } from "@tanstack/react-router";
import { ExternalLink, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminSession } from "./AdminGate";

export function AdminTopBar({ displayName, onSignOut, signingOut }: AdminSession) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101217] text-[#f5f1e8]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 md:px-8">
        <Link
          to="/admin"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md text-[#f5f1e8]"
        >
          <span className="font-display text-[19px] font-medium tracking-[-0.02em] md:text-[20px]">
            Restoration Notes
          </span>
          <span className="hidden text-[13px] font-semibold tracking-[0.14em] text-[#c3bdb1] uppercase md:inline">
            Staff
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <Button
            variant="ghost"
            asChild
            className="hidden text-[#f5f1e8] hover:bg-white/10 hover:text-white md:inline-flex"
          >
            <Link to="/">
              <ExternalLink aria-hidden /> Public site
            </Link>
          </Button>
          <span className="truncate text-[14px] text-[#c3bdb1] md:text-[15px]" title={displayName}>
            {displayName}
          </span>
          <Button
            variant="ghost"
            onClick={onSignOut}
            disabled={signingOut}
            aria-label={signingOut ? "Signing out" : "Sign out"}
            title="Sign out"
            className="h-11 min-w-11 shrink-0 px-2 text-[#f5f1e8] hover:bg-white/10 hover:text-white md:px-3"
          >
            <LogOut aria-hidden />
            <span className="hidden md:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
