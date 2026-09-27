import { describe, expect, it } from "vitest";
import {
  compareNames,
  inquiryBody,
  partyName,
  stateFromLocation,
  summarizeMvr,
} from "@/lib/sources/vitu-mvr";

describe("stateFromLocation", () => {
  it("finds the two-letter state in free-text locations", () => {
    expect(stateFromLocation("Hauppauge, NY")).toBe("NY");
    expect(stateFromLocation("Scottsdale AZ 85251")).toBe("AZ");
    expect(stateFromLocation("Boston, MA · pickup")).toBe("MA");
    expect(stateFromLocation("Bologna")).toBeNull();
    expect(stateFromLocation(null)).toBeNull();
  });
});

describe("inquiryBody", () => {
  it("matches the spec's InquiryDTO for a VIN lookup and merges state extras", () => {
    expect(
      inquiryBody({
        state: "ny",
        vin: "wp0aa2996xs620000",
        refNumber: "36b67283-2305-46a5-a827-22f38a9338b8",
      }),
    ).toEqual({
      state: "NY",
      refNumber: "36b67283-2305-46a5-a827-22f38a9338b8",
      inquiryString: "WP0AA2996XS620000",
      inquiryType: "VIN",
    });
    const tx = inquiryBody(
      { state: "TX", vin: "1G6DE5E55D0163983", refNumber: "r" },
      { dealerNumber: 150786, sellerUserName: "Angtx" },
    );
    expect(tx.dealerNumber).toBe(150786);
    expect(tx.sellerUserName).toBe("Angtx");
  });
});

describe("names", () => {
  it("reads party names from name or first/last fields", () => {
    expect(partyName({ firstName: "Jim", lastName: "Bowen" })).toBe("Jim Bowen");
    expect(partyName({ businessName: "First Bank NA" })).toBe("First Bank NA");
    expect(partyName(null)).toBeNull();
  });
  it("compares seller and registered owner loosely", () => {
    expect(compareNames("James Bowen", "Bowen, James")).toBe("match");
    expect(compareNames("Jim Bowen Jr", "James Bowen")).toBe("match");
    expect(compareNames("Sarah Bowen", "James Bowen")).toBe("partial");
    expect(compareNames("James Bowen", "Bowen Holdings LLC")).toBe("partial");
    expect(compareNames("Pat Smith", "James Bowen")).toBe("mismatch");
    expect(compareNames(null, "x")).toBe("unknown");
  });
});

describe("summarizeMvr", () => {
  const ctx = {
    vin: "WP0AA2996XS620000",
    state: "NY",
    refNumber: "r",
    inquiryId: 42,
    sellerName: "James Bowen",
    now: new Date("2026-09-27T00:00:00Z"),
  };
  it("verifies a matching owner with no lien and current in-state registration", () => {
    const s = summarizeMvr(
      {
        inquiry: { processedDate: "2026-09-27T01:00:00Z", error: null },
        vehicle: { vin: "WP0AA2996XS620000", year: 1999 },
        owner: { firstName: "James", lastName: "Bowen" },
        registration: { state: "NY", expirationDate: "2027-03-01" },
        title: { titleState: "NY", titleNumber: "NY123" },
      },
      ctx,
    );
    expect(s.verdict).toBe("verified");
    expect(s.owner).toBe("James Bowen");
    expect(s.ownerMatch).toBe("match");
    expect(s.lienholder).toBeNull();
    expect(s.flags).toEqual([]);
  });
  it("flags a lien, an owner mismatch, an out-of-state registration and an expired plate", () => {
    const s = summarizeMvr(
      {
        processedDate: "2026-09-27T01:00:00Z",
        vehicle: { vin: "WP0AA2996XS620000" },
        owner: { name: "Pat Smith" },
        lienholder: { name: "First Bank" },
        registration: { state: "NJ", expirationDate: "2025-01-01" },
      },
      ctx,
    );
    expect(s.verdict).toBe("issues");
    expect(s.flags).toEqual([
      "Registered owner (Pat Smith) does not match the seller",
      "Lienholder on record: First Bank",
      "Registered in NJ, listing says NY",
      "Registration expired 2025-01-01",
    ]);
  });
  it("is pending until the state has responded", () => {
    const s = summarizeMvr(
      { inquiry: { createdDate: "2026-09-27T00:00:00Z", processedDate: null } },
      ctx,
    );
    expect(s.verdict).toBe("pending");
    expect(s.processed).toBe(false);
  });
});
