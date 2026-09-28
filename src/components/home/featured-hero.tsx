"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { money } from "@/lib/format/money";
import type { FeaturedCar } from "@/server/queries/featured";

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
  useEffect(() => {
    if (cars.length < 2 || paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % cars.length), interval);
    return () => clearInterval(t);
  }, [cars.length, paused, interval]);
  if (cars.length === 0) return null;
  const car = cars[i % cars.length]!;
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
      <Link href={car.href} className="featured-card" aria-live="polite">
        <div
          className="featured-photo"
          style={car.photo ? { backgroundImage: `url("${car.photo}")` } : undefined}
          aria-hidden="true"
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
      {cars.length > 1 ? (
        <div className="featured-nav">
          <button
            type="button"
            className="btn sm"
            aria-label="Previous car"
            onClick={() => setI((x) => (x - 1 + cars.length) % cars.length)}
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
            onClick={() => setI((x) => (x + 1) % cars.length)}
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
