"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateListing } from "@/server/listings";
import { PhotoUpload } from "./photo-upload";

export interface EditableListing {
  id: string;
  type: "classified" | "auction" | "private";
  status: "draft" | "active" | "ended" | "sold" | "withdrawn";
  make: string;
  model: string;
  year: number;
  trim: string | null;
  vin: string | null;
  miles: number;
  color: string | null;
  colorClass: "std" | "spec" | "pts";
  condition: "ex" | "good" | "fair";
  history: "clean" | "acc";
  packages: string[];
  title: string;
  description: string | null;
  photos: string[];
  location: string | null;
  askingPrice: number | null;
  reservePrice: number | null;
  hasBids: boolean;
}

export function EditListingForm({ listing }: { listing: EditableListing }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    make: listing.make,
    model: listing.model,
    year: String(listing.year),
    trim: listing.trim ?? "",
    vin: listing.vin ?? "",
    miles: String(listing.miles),
    color: listing.color ?? "",
    colorClass: listing.colorClass,
    condition: listing.condition,
    history: listing.history,
    weissach: listing.packages.includes("weissach"),
    title: listing.title,
    description: listing.description ?? "",
    location: listing.location ?? "",
    price:
      listing.type === "auction"
        ? listing.reservePrice != null
          ? String(listing.reservePrice)
          : ""
        : listing.askingPrice != null
          ? String(listing.askingPrice)
          : "",
  });
  const [photos, setPhotos] = useState<string[]>(listing.photos);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const seg = <K extends "colorClass" | "condition" | "history">(
    k: K,
    opts: [(typeof f)[K], string][],
  ) => (
    <div className="seg" role="group">
      {opts.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={f[k] === v} onClick={() => set(k, v)}>
          {label}
        </button>
      ))}
    </div>
  );

  function save() {
    setError(null);
    const year = Number(f.year);
    const miles = Number(f.miles);
    const price = f.price.trim() === "" ? null : Math.round(Number(f.price));
    start(async () => {
      const r = await updateListing({
        id: listing.id,
        make: f.make.trim(),
        model: f.model.trim(),
        year,
        trim: f.trim.trim() || null,
        vin: f.vin.trim().toUpperCase() || "",
        miles,
        color: f.color.trim() || null,
        colorClass: f.colorClass,
        condition: f.condition,
        history: f.history,
        packages: f.weissach ? ["weissach"] : [],
        title: f.title.trim() || `${year} ${f.make.trim()} ${f.model.trim()}`,
        description: f.description.trim() || null,
        photos,
        location: f.location.trim() || null,
        askingPrice: listing.type === "auction" ? null : price,
        reservePrice: listing.type === "auction" ? price : null,
      });
      if (!r.ok) return setError(r.error);
      router.push(`/listings/${listing.id}`);
      router.refresh();
    });
  }

  return (
    <form
      className="form edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="fld">
        <label htmlFor="e-title">Listing title</label>
        <input
          id="e-title"
          value={f.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={120}
          required
        />
      </div>
      <div className="fld">
        <span className="lab">Photos</span>
        <PhotoUpload value={photos} onChange={setPhotos} />
        <span className="hint">
          The first photo is the cover. Drag a file in, or paste an https image link.
        </span>
      </div>
      <div className="fld">
        <label htmlFor="e-desc">Description</label>
        <textarea
          id="e-desc"
          rows={6}
          maxLength={8000}
          value={f.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>
      <div className="grid-3">
        <div className="fld">
          <label htmlFor="e-make">Make</label>
          <input
            id="e-make"
            value={f.make}
            onChange={(e) => set("make", e.target.value)}
            maxLength={60}
            required
          />
        </div>
        <div className="fld">
          <label htmlFor="e-model">Model</label>
          <input
            id="e-model"
            value={f.model}
            onChange={(e) => set("model", e.target.value)}
            maxLength={80}
            required
          />
        </div>
        <div className="fld">
          <label htmlFor="e-year">Model year</label>
          <input
            id="e-year"
            type="number"
            min={1900}
            max={2100}
            value={f.year}
            onChange={(e) => set("year", e.target.value)}
            required
          />
        </div>
        <div className="fld">
          <label htmlFor="e-trim">Trim</label>
          <input
            id="e-trim"
            value={f.trim}
            onChange={(e) => set("trim", e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="fld">
          <label htmlFor="e-miles">Mileage</label>
          <input
            id="e-miles"
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            value={f.miles}
            onChange={(e) => set("miles", e.target.value)}
            required
          />
        </div>
        <div className="fld">
          <label htmlFor="e-vin">VIN (optional)</label>
          <input
            id="e-vin"
            className="mono"
            value={f.vin}
            onChange={(e) => set("vin", e.target.value)}
            maxLength={17}
            autoComplete="off"
          />
        </div>
        <div className="fld">
          <label htmlFor="e-color">Exterior color</label>
          <input
            id="e-color"
            value={f.color}
            onChange={(e) => set("color", e.target.value)}
            maxLength={60}
          />
        </div>
        <div className="fld">
          <label htmlFor="e-loc">Location</label>
          <input
            id="e-loc"
            value={f.location}
            onChange={(e) => set("location", e.target.value)}
            maxLength={100}
            placeholder="Boston, MA"
          />
        </div>
        <div className="fld">
          <label htmlFor="e-price">
            {listing.type === "auction" ? "Reserve price (blank for no reserve)" : "Asking price"}
          </label>
          <input
            id="e-price"
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            value={f.price}
            onChange={(e) => set("price", e.target.value)}
            required={listing.type !== "auction"}
          />
          {listing.type === "auction" && listing.hasBids ? (
            <span className="hint">Bidding has started, so the reserve can only be lowered.</span>
          ) : null}
        </div>
      </div>
      <div className="fld">
        <span className="lab">Color class</span>
        {seg("colorClass", [
          ["std", "Standard"],
          ["spec", "Special color"],
          ["pts", "Paint to Sample"],
        ])}
      </div>
      <div className="fld">
        <span className="lab">Condition</span>
        {seg("condition", [
          ["ex", "Excellent"],
          ["good", "Good"],
          ["fair", "Needs work"],
        ])}
      </div>
      <div className="fld">
        <span className="lab">History report</span>
        {seg("history", [
          ["clean", "Clean"],
          ["acc", "Accident reported"],
        ])}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={f.weissach}
          onChange={(e) => set("weissach", e.target.checked)}
        />{" "}
        Weissach package
      </label>
      {error ? <p className="err">{error}</p> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => router.push(`/listings/${listing.id}`)}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
