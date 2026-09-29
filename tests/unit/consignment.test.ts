import { describe, expect, it } from "vitest";
import { CONSIGNMENT_SERVICES, consignmentCar, consignmentSchema } from "@/lib/sell/consignment";

describe("consignment request", () => {
  const good = {
    year: "2004",
    make: "Ferrari",
    model: "360 Challenge Stradale",
    trim: "",
    miles: "20000",
    vin: "",
    location: "Costa Mesa, CA",
    phone: "",
    services: ["condition_report", "photos"],
    estimate: "795500",
    notes: "",
  };
  it("accepts the form's strings and coerces numbers", () => {
    const r = consignmentSchema.safeParse(good);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.year).toBe(2004);
      expect(r.data.miles).toBe(20_000);
      expect(r.data.estimate).toBe(795_500);
      expect(consignmentCar(r.data)).toBe("2004 Ferrari 360 Challenge Stradale");
    }
  });
  it("needs a location, at least one service, and a plausible VIN when given", () => {
    expect(consignmentSchema.safeParse({ ...good, location: "" }).success).toBe(false);
    expect(consignmentSchema.safeParse({ ...good, services: [] }).success).toBe(false);
    expect(consignmentSchema.safeParse({ ...good, services: ["valet"] }).success).toBe(false);
    expect(consignmentSchema.safeParse({ ...good, vin: "ABC" }).success).toBe(false);
    expect(consignmentSchema.safeParse({ ...good, vin: "wp0af2a98ps270000" }).success).toBe(true);
    expect(CONSIGNMENT_SERVICES.map((s) => s.key)).toEqual([
      "condition_report",
      "photos",
      "logistics",
      "facility",
    ]);
  });
});
