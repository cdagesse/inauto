"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { money } from "@/components/account/money";
import { CardPhoto } from "@/components/listings/card-photo";
import { prefetchPhoto } from "@/lib/listings/photo-request";
import type { FeaturedCar } from "@/server/queries/featured";

/** The hero card is a full column on phones and roughly half the row above 900px. */
const HERO_SIZES = "(max-width: 900px) 100vw, 50vw";

/** Rotating card of featured cars for the home hero. Pauses while hovered or focused. */
export function FeaturedHero({
  cars,
  interval = 5000,
}: {
  cars: FeaturedCar[];
  interval?: number;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = cars.length;
  const rotating = n > 1 && !paused;

  // Warm the upcoming slide's photo so the swap never blanks the card. Keyed
  // on the URL, not the cars array, so a parent re-render (router.refresh,
  // revalidation) that reserializes props does not re-issue the fetch.
  const next = n > 1 ? cars[(i + 1) % n]?.photo : undefined;
  useEffect(() => {
    if (next) prefetchPhoto(next, HERO_SIZES);
  }, [next]);

  // Advance on a timeout (not an interval) so the clock restarts after manual
  // navigation and a chosen car gets its full turn.
  useEffect(() => {
    if (!rotating) return;
    const t = setTimeout(() => setI((x) => (x + 1) % n), interval);
    return () => clearTimeout(t);
  }, [rotating, i, n, interval]);

  if (n === 0) return null;
  const car = cars[i % n]!;
  return (
    <div
      className="featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured cars"
    >
      {/* Silent while auto-rotating (otherwise every tick is announced); polite once paused. */}
      <Link href={car.href} className="featured-card" aria-live={rotating ? "off" : "polite"}>
        <CardPhoto
          src={car.photo}
          className="featured-photo"
          sizes={HERO_SIZES}
          priority={i === 0}
        />
        <div className="featured-body">
          <span className="pill accent">
            {car.featured
              ? "Featured"
              : car.views
                ? `Trending · ${car.views.toLocaleString("en-US")} views this week`
                : "Just listed"}
          </span>
          <span className="lab featured-badge">{car.badge}</span>
          <h3 className="display">{car.title}</h3>
          <p className="hint">{car.sub}</p>
          <p className="num featured-price">
            {car.price != null ? money(car.price, car.currency) : "No bids yet"}{" "}
            <span className="hint">{car.priceLabel}</span>
          </p>
        </div>
      </Link>
      {n > 1 ? (
        <div className="featured-nav">
          <button
            type="button"
            className="btn sm"
            aria-label="Previous car"
            onClick={() => setI((x) => (x - 1 + n) % n)}
          >
            ‹
          </button>
          <div className="featured-dots" role="tablist" aria-label="Choose a featured car">
            {cars.map((c, k) => (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={k === i}
                aria-label={c.title}
                className={k === i ? "on" : ""}
                onClick={() => setI(k)}
              />
            ))}
          </div>
          <button
            type="button"
            className="btn sm"
            aria-label="Next car"
            onClick={() => setI((x) => (x + 1) % n)}
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
