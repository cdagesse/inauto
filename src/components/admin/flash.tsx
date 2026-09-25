/** Shows the ?ok= / ?error= outcome that form actions redirect back with. */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p className="err">{error}</p>;
  if (ok) return <p className="flash-ok">{ok}</p>;
  return null;
}
