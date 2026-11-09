import { Link } from "@tanstack/react-router";
import type { Sermon } from "@/lib/sermon/types";
import { CoverTile } from "./CoverTile";

export function MoreSermons({ sermons, currentId }: { sermons: Sermon[]; currentId: string }) {
  const others = sermons.filter((sermon) => sermon.id !== currentId).slice(0, 3);
  if (!others.length) return null;
  return (
    <section className="more" aria-label="Earlier sermons">
      <div className="wrap">
        <div className="head">
          <h2>Earlier sermons</h2>
          <Link to="/archive">All past sermons →</Link>
        </div>
        <div className="strip">
          {others.map((sermon) => (
            <CoverTile key={sermon.id} sermon={sermon} small />
          ))}
        </div>
      </div>
    </section>
  );
}
