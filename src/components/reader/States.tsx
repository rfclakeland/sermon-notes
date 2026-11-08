import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function ReaderSkeleton() {
  return <div className="hero" aria-busy="true" aria-label="Loading sermon" />;
}

export function StateMessage({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
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

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <StateMessage
      title="We couldn’t load sermons"
      body="Check your connection and try again. Any notes you’ve written are still saved on this device."
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
