import type { VenueComparison } from "@/lib/market/venues";
import { venuePrice } from "@/lib/market/venues";
import { mi, usd } from "./format";

/**
 * "Where a car like this sells best": one row per auction venue with results
 * for the generation, the best one called out. Pure presentation, usable from
 * server and client components alike.
 */
export function VenueTable({
  comparison,
  short,
  compact = false,
}: {
  comparison: VenueComparison;
  short: string;
  compact?: boolean;
}) {
  const { venues, best, band, dealerMedian, miles } = comparison;
  if (venues.length === 0) {
    return (
      <p className="note">
        No {short} auction results for this generation yet, so we cannot compare venues.
      </p>
    );
  }
  return (
    <div className="venues">
      {best ? (
        <div className="rec venue-rec">
          <b>
            Best venue for {miles != null ? `a ${mi(miles)}-mile ` : "this "}
            {short}: {best.platform}
          </b>
          <p>{comparison.reason}</p>
        </div>
      ) : (
        <p className="note">
          Not enough results on any single venue to recommend one yet. The table shows what we have.
        </p>
      )}
      <div className="tw">
        <table className="venue-table">
          <thead>
            <tr>
              <th>Venue</th>
              <th className="n">Results</th>
              <th className="n">Sold</th>
              {band ? <th className="n">Similar miles</th> : null}
              <th className="n">{band ? "Median, similar" : "Median hammer"}</th>
              <th className="n">vs. dealer</th>
              {compact ? null : <th className="n">Their miles</th>}
              {compact ? null : <th>Latest</th>}
            </tr>
          </thead>
          <tbody>
            {venues.map((v) => {
              const price = venuePrice(v);
              const isBest = best?.platform === v.platform;
              return (
                <tr key={v.platform} className={isBest ? "sel" : undefined}>
                  <td>
                    {v.platform}
                    {isBest ? (
                      <>
                        {" "}
                        <span className="pill accent">Best fit</span>
                      </>
                    ) : null}
                  </td>
                  <td className="n">{v.n}</td>
                  <td className="n">
                    {v.sold} <span className="hint">({Math.round(v.sellThrough * 100)}%)</span>
                  </td>
                  {band ? <td className="n">{v.similar}</td> : null}
                  <td className="n">
                    {price != null ? usd(price) : "n/a"}
                    {band && v.similar < 2 && v.medianHammer != null ? (
                      <div className="hint">all miles</div>
                    ) : null}
                  </td>
                  <td
                    className="n mono"
                    style={{
                      color:
                        v.vsDealer == null
                          ? undefined
                          : v.vsDealer >= 0
                            ? "var(--up)"
                            : "var(--down)",
                    }}
                  >
                    {v.vsDealer == null
                      ? "n/a"
                      : `${v.vsDealer >= 0 ? "+" : ""}${Math.round(v.vsDealer * 100)}%`}
                  </td>
                  {compact ? null : <td className="n">{mi(v.medianMiles)}</td>}
                  {compact ? null : <td className="mono">{v.latest ?? ""}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Sold results only set the medians; reserve-not-met and withdrawn rows count against
        sell-through. {band ? `Similar means ${mi(band.lo)} to ${mi(band.hi)} miles. ` : ""}
        Dealer median for the generation is {usd(dealerMedian)}. A venue needs at least 3 results
        and 2 sales to be recommended.
      </p>
    </div>
  );
}
