import { describe, expect, it } from "vitest";
import { carLine, carPreview } from "@/lib/seo/preview";

describe("carPreview", () => {
  it("offers the first https photo as the large preview image", () => {
    const m = carPreview({
      title: "2000 Porsche 911 Carrera · UrCar",
      description: "41,000 mi · Douglassville, PA. Sold for $37,500 on Bring a Trailer.",
      photos: [
        null,
        "http://insecure.example/a.jpg",
        "https://cdn.example/b.jpg",
        "https://cdn.example/c.jpg",
      ],
      path: "/listings/ext/bat/14910716",
    });
    expect(m.openGraph).toMatchObject({
      title: "2000 Porsche 911 Carrera · UrCar",
      url: "/listings/ext/bat/14910716",
      images: [{ url: "https://cdn.example/b.jpg" }],
    });
    expect(m.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["https://cdn.example/b.jpg"],
    });
    expect(m.description).toContain("Sold for $37,500");
  });

  it("leaves the image out, and the card small, when there is no usable photo", () => {
    const m = carPreview({ title: "t", description: "d", photos: [], path: "/listings/x" });
    expect(m.openGraph).not.toHaveProperty("images");
    expect(m.twitter).toMatchObject({ card: "summary" });
  });
});

describe("carLine", () => {
  it("joins the known parts with middle dots", () => {
    expect(carLine(["2000 Porsche 911", null, "41,000 mi", "", "Douglassville, PA"])).toBe(
      "2000 Porsche 911 · 41,000 mi · Douglassville, PA",
    );
    expect(carLine([null, undefined])).toBe("");
  });
});
