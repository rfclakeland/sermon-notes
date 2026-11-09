import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function ReaderSkeleton() {
  return <div className="hero" aria-busy="true" aria-label="Loading sermon" />;
}

export function StateMessage({
  title,
  body,
  action,
  inline = false,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  /** Inside a page that already has its own h1: render a quieter h2 block. */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className="state-inline" role="status">
        <h2>{title}</h2>
        {body ? <p>{body}</p> : null}
        {action ? <div className="quiet-acts">{action}</div> : null}
      </div>
    );
  }
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{title}</h1>
        {body ? <p className="lede">{body}</p> : null}
        {action ? <div className="quiet-acts">{action}</div> : null}
      </header>
    </div>
  );
}

export function LoadError({
  onRetry,
  inline = false,
  body = "Check your connection and try again. A loading error doesn’t remove notes already saved in this browser; open My notes to read or download them.",
}: {
  onRetry: () => void;
  inline?: boolean;
  body?: string;
}) {
  return (
    <StateMessage
      inline={inline}
      title="We couldn’t load sermons"
      body={body}
      action={<Button onClick={onRetry}>Try again</Button>}
    />
  );
}

export function SermonNotFound() {
  return (
    <StateMessage
      title="We couldn’t find that sermon"
      body="The link may be mistyped, or the sermon was removed. Browse past sermons instead."
      action={
        <Button asChild>
          <Link to="/archive">Browse past sermons</Link>
        </Button>
      }
    />
  );
}
