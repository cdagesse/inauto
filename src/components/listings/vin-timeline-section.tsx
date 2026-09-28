import { getVinTimeline } from "@/server/queries/vin";
import { VinTimeline } from "./vin-timeline";

/**
 * Server component that owns the VIN history fan-out (five lookups) so a detail
 * page can stream it inside <Suspense> after the listing itself has painted.
 * Mount it only for a plausible VIN (see isVin): VinTimeline renders nothing
 * when there are no events, so the skeleton should not flash for cars we
 * could never have history on.
 */
export async function VinTimelineSection({
  vin,
  current,
  vinShown,
}: {
  vin: string | null | undefined;
  current: { kind: "external" | "inauto" | "dealer"; id: string };
  vinShown: string | null;
}) {
  const events = await getVinTimeline(vin, current);
  return <VinTimeline events={events} vinShown={vinShown} />;
}

/** Suspense fallback for the VIN timeline; reuses the section's own styling. */
export function VinTimelineSkeleton() {
  return (
    <section className="vin-timeline" aria-busy="true" aria-label="History by VIN, loading">
      <div className="ms-head">
        <div>
          <div className="eyebrow">History by VIN</div>
          <p className="sub" style={{ margin: "4px 0 0" }}>
            Checking dealer, auction and UrCar records for this car…
          </p>
        </div>
      </div>
    </section>
  );
}
