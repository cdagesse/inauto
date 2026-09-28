/**
 * Purchase evidence (title scans, proof-of-ownership video) lives in a private
 * Vercel Blob prefix. Rows store the blob pathname, never a URL, and the only
 * way to read one is the authenticated streaming route. Older rows still hold
 * the public URL the first release stored; those are treated as legacy and
 * redirected rather than fetched.
 */

export const EVIDENCE_PREFIX = "purchases/";

/** URL slot → uploads column key. */
export const EVIDENCE_SLOTS = {
  "title-front": "titleFront",
  "title-back": "titleBack",
  "ownership-video": "ownershipVideo",
} as const;
export type EvidenceSlot = keyof typeof EVIDENCE_SLOTS;
export type EvidenceKey = (typeof EVIDENCE_SLOTS)[EvidenceSlot];

export const isEvidenceSlot = (s: string): s is EvidenceSlot => Object.hasOwn(EVIDENCE_SLOTS, s);

/** Where one user's evidence uploads go: purchases/{clerkId}/. */
export const evidencePrefixFor = (clerkId: string) => `${EVIDENCE_PREFIX}${clerkId}/`;

const PATHNAME_RE = /^purchases\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9._-]{1,200}$/;

/** A stored blob pathname under purchases/{owner}/{file}; nothing else. */
export function isEvidencePathname(s: string): boolean {
  if (!PATHNAME_RE.test(s)) return false;
  const file = s.slice(s.lastIndexOf("/") + 1);
  return file !== "." && file !== "..";
}

/** True when the pathname belongs to this user's evidence prefix. */
export function ownsEvidencePathname(pathname: string, clerkId: string): boolean {
  return isEvidencePathname(pathname) && pathname.startsWith(evidencePrefixFor(clerkId));
}

const LEGACY_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/** Rows written before uploads went private hold the public Blob URL verbatim. */
export function isLegacyEvidenceUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname.endsWith(LEGACY_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** The authenticated route that streams one evidence file. */
export const evidenceHref = (purchaseId: string, slot: EvidenceSlot) =>
  `/api/purchases/${purchaseId}/evidence/${slot}`;

/**
 * Blobs under purchases/ that no purchase row references and that are past
 * the grace period (so a buyer still filling in the form keeps their files).
 */
export function orphanedEvidence(
  blobs: { pathname: string; uploadedAt: Date }[],
  referenced: ReadonlySet<string>,
  now: Date,
  graceMs: number,
): string[] {
  const cutoff = now.getTime() - graceMs;
  return blobs
    .filter(
      (b) =>
        b.pathname.startsWith(EVIDENCE_PREFIX) &&
        !referenced.has(b.pathname) &&
        b.uploadedAt.getTime() <= cutoff,
    )
    .map((b) => b.pathname);
}
