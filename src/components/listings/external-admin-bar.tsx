import { toggleFeaturedForm } from "@/server/admin/featured";

/** Fixed bottom bar for admins on a platform auction page: feature it on the home page. */
export function ExternalAdminBar({
  refId,
  back,
  featured,
  live,
}: {
  refId: string;
  back: string;
  featured: boolean;
  live: boolean;
}) {
  return (
    <div className="owner-bar" role="region" aria-label="Admin">
      <div className="wrap owner-bar-inner">
        <div className="owner-bar-state">
          <span className="lab">Admin</span>
          <span className={`pill ${live ? "up" : ""}`}>{live ? "live" : "ended"}</span>
          {featured ? <span className="pill accent">On home page</span> : null}
        </div>
        <div className="owner-bar-actions">
          <form action={toggleFeaturedForm}>
            <input type="hidden" name="kind" value="external" />
            <input type="hidden" name="refId" value={refId} />
            <input type="hidden" name="back" value={back} />
            <button type="submit" className={`btn sm${featured ? "" : " primary"}`}>
              {featured ? "Remove from home page" : "Feature on home page"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
