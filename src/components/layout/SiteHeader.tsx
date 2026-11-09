import { Link, useRouterState } from "@tanstack/react-router";
import { CHURCH_NAME, SAMPLE_NOTICE } from "@/lib/sermon/export";
import { useSermons } from "@/lib/sermon/queries";

export function SiteHeader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const sermons = useSermons("public");
  const latestId = sermons.data?.sermons[0]?.id;
  const onLatest = pathname === "/" || (!!latestId && pathname === `/sermons/${latestId}`);
  const onArchive = pathname === "/archive";
  const onNotes = pathname === "/notes";
  return (
    <header className="app">
      <div className="wrap">
        <Link to="/" className="brand" aria-label={`Restoration Notes — ${CHURCH_NAME}`}>
          <strong>Restoration Notes</strong>
          <span>Restoration Fellowship · Lakeland</span>
        </Link>
        <nav aria-label="Main">
          <Link to="/" aria-current={onLatest ? "page" : undefined}>
            Latest
          </Link>
          <Link to="/archive" aria-current={onArchive ? "page" : undefined}>
            <span className="long">Past sermons</span>
            <span className="short">Sermons</span>
          </Link>
          <Link to="/notes" aria-current={onNotes ? "page" : undefined}>
            My notes
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="app">
      <div className="wrap">
        <div>
          <strong>{CHURCH_NAME}</strong>
          <p>
            {SAMPLE_NOTICE} Your answers save automatically in this browser. No account and no
            syncing across devices. Clearing browser data can remove them — download a copy to keep
            them.
          </p>
        </div>
        <Link to="/admin">Staff sign in</Link>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rn">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-paper focus:px-3 focus:py-2"
        href="#main"
      >
        Skip to notes
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
