import { Link } from "@tanstack/react-router";
import { ExternalLink, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminTopBar({
  onSignOut,
  children,
}: {
  onSignOut: () => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101217] text-[#f5f1e8]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/admin"
            className="inline-flex min-h-11 items-baseline gap-2 rounded-md text-[#f5f1e8]"
          >
            <span className="font-display text-[20px] font-medium tracking-[-0.02em] whitespace-nowrap">
              Restoration Notes
            </span>
            <span className="hidden text-[13px] font-semibold tracking-[0.14em] text-[#c3bdb1] uppercase sm:inline">
              Staff
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          {children}
          <Button variant="ghost" asChild className="hidden md:inline-flex">
            <Link to="/">
              <ExternalLink aria-hidden /> Public site
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Sign out">
            <LogOut aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  );
}
