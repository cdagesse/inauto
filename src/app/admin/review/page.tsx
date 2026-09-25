import Link from "next/link";
import { mi, usd } from "@/components/account/money";
import { Flash } from "@/components/admin/flash";
import { Pager } from "@/components/admin/pager";
import { reassignGenerationForm, reviewRowsForm } from "@/server/admin/actions";
import { listGenerationOptions, listModelOptions, listReviewRows } from "@/server/admin/queries";
import { parsePage } from "@/server/admin/rules";

export const dynamic = "force-dynamic";

const REASONS = [
  "needs_review",
  "outlier_price",
  "likely_mislabeled",
  "incomplete",
  "manual",
] as const;
const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/.test(v);

export default async function AdminReview({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string;
    modelId?: string;
    generationId?: string;
    reason?: string;
    page?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const source = sp.source === "auction" ? "auction" : "dealer";
  const modelId = isUuid(sp.modelId) ? sp.modelId : undefined;
  const generationId = isUuid(sp.generationId) ? sp.generationId : undefined;
  const reason = REASONS.includes(sp.reason as (typeof REASONS)[number]) ? sp.reason : undefined;
  const page = parsePage(sp.page);
  const [{ rows, total }, modelOptions, genOptions] = await Promise.all([
    listReviewRows({ source, modelId, generationId, reason, page }),
    listModelOptions(),
    listGenerationOptions(modelId ?? null),
  ]);
  const qs = new URLSearchParams();
  qs.set("source", source);
  if (modelId) qs.set("modelId", modelId);
  if (generationId) qs.set("generationId", generationId);
  if (reason) qs.set("reason", reason);
  const base = `/admin/review?${qs.toString()}`;
  const back = `${base}&page=${page}`;
  const gensByModel = new Map<string, typeof genOptions>();
  for (const g of genOptions)
    gensByModel.set(g.modelId, [...(gensByModel.get(g.modelId) ?? []), g]);

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} />
      <form className="admin-search" action="/admin/review" method="get">
        <select name="source" defaultValue={source}>
          <option value="dealer">Dealer sales</option>
          <option value="auction">Auction results</option>
        </select>
        <select name="modelId" defaultValue={modelId ?? ""}>
          <option value="">All models</option>
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.makeName} {m.name}
            </option>
          ))}
        </select>
        <select name="generationId" defaultValue={generationId ?? ""}>
          <option value="">All generations</option>
          {genOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code}
            </option>
          ))}
        </select>
        <select name="reason" defaultValue={reason ?? ""}>
          <option value="">Flagged or excluded</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", " ")}
            </option>
          ))}
        </select>
        <button className="btn sm" type="submit">
          Filter
        </button>
      </form>

      <form action={reviewRowsForm}>
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="back" value={back} />
        <div className="admin-actions" style={{ marginBottom: 10 }}>
          <button className="btn sm primary" name="decision" value="include" type="submit">
            Include selected
          </button>
          <button className="btn sm danger" name="decision" value="exclude" type="submit">
            Exclude selected
          </button>
          <span className="hint">
            Include clears the flag; exclude sets a manual exclusion jobs never overwrite.
          </span>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Date</th>
                <th>Year</th>
                <th>Gen</th>
                <th className="n">Miles</th>
                <th className="n">Price</th>
                <th>{source === "dealer" ? "Dealer / state" : "Platform"}</th>
                <th>Flag</th>
                <th>Raw text</th>
                <th>Reassign</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="note">
                    Nothing to review.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input type="checkbox" name="ids" value={r.id} aria-label="Select row" />
                    </td>
                    <td className="mono">{r.date ?? ""}</td>
                    <td className="mono">{r.year ?? ""}</td>
                    <td className="mono">
                      {r.generationCode ?? <span className="rnm">none</span>}
                    </td>
                    <td className="n">{r.miles != null ? mi(r.miles) : ""}</td>
                    <td className="n">{r.price != null ? usd(r.price) : ""}</td>
                    <td>
                      {source === "dealer" ? (
                        <>
                          {r.dealerName ?? ""}{" "}
                          {r.state ? <span className="mono">{r.state}</span> : null}
                        </>
                      ) : r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                          {r.platform}
                        </a>
                      ) : (
                        r.platform
                      )}
                    </td>
                    <td>
                      {r.needsReview ? <span className="pill">review</span> : null}{" "}
                      {r.excludedReason ? (
                        <span className="pill down">{r.excludedReason.replace("_", " ")}</span>
                      ) : null}
                    </td>
                    <td className="hint" style={{ maxWidth: 220 }}>
                      {r.rawTrim ?? ""}
                    </td>
                    <td>
                      <select
                        name={`gen-${r.id}`}
                        form={`reassign-${r.id}`}
                        defaultValue={r.generationId ?? ""}
                        aria-label="Reassign generation"
                      >
                        <option value="">…</option>
                        {(gensByModel.get(r.modelId) ?? []).map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.code}
                          </option>
                        ))}
                      </select>{" "}
                      <button className="btn sm" form={`reassign-${r.id}`} type="submit">
                        Go
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </form>
      {rows.map((r) => (
        <form key={r.id} id={`reassign-${r.id}`} action={reassignGenerationForm}>
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="back" value={back} />
        </form>
      ))}
      <Pager page={page} total={total} href={base} />
      <p className="note">
        Tip: rows flagged “review” could not be assigned to a generation automatically. Pick one in
        the Reassign column. <Link href="/admin/models">Edit generations</Link> if a year range is
        wrong.
      </p>
    </div>
  );
}
