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

describe("summarizeMvr (MVRBaseRecordDTO)", () => {
  const ctx = {
    vin: "WP0AA2996XS620000",
    state: "NY",
    refNumber: "r",
    inquiryId: 42,
    sellerName: "James Bowen",
    listingMiles: 41_000,
    now: new Date("2026-09-27T00:00:00Z"),
  };
  it("verifies a matching owner with no lien and current in-state registration", () => {
    const s = summarizeMvr(
      {
        vehicle: {
          vin: "WP0AA2996XS620000",
          year: 1999,
          make: "PORSCHE",
          model: "911",
          odometerReading: 40_512,
          odometerReadingDate: "2025-11-02",
          odometerValidity: "Actual",
        },
        title: {
          titleNumber: "NY123",
          titleType: "Original",
          titlingState: "NY",
          titleIssueDate: "2019-05-01",
          plateNumber: "ABC1234",
        },
        owners: [
          { ownerType: "Individual", firstName: "James", middleName: "R", lastName: "Bowen" },
        ],
        lienholders: [],
        registration: {
          expirationDate: "2027-03-01",
          plateNumber: "ABC1234",
          address: { city: "Hauppauge", state: "NY" },
        },
      },
      { ...ctx, inquiry: { processedDate: "2026-09-27T01:00:00Z", charged: true, error: null } },
    );
    expect(s.verdict).toBe("verified");
    expect(s.owner).toBe("James R Bowen");
    expect(s.ownerMatch).toBe("match");
    expect(s.vehicle).toBe("1999 PORSCHE 911");
    expect(s.lienholder).toBeNull();
    expect(s.registrationState).toBe("NY");
    expect(s.titleState).toBe("NY");
    expect(s.odometer).toBe(40_512);
    expect(s.flags).toEqual([]);
  });
  it("flags a lien, owner mismatch, out-of-state plate, expiry, vehicle stop and odometer rollback", () => {
    const s = summarizeMvr(
      {
        vehicle: { vin: "WP0AA2996XS620000", odometerReading: 68_000, isVehicleStop: true },
        owners: [{ name: "Pat Smith" }, { businessName: "Smith Holdings LLC" }],
        lienholders: [{ name: "First Bank", lienDate: "2024-06-01", electronicLien: true }],
        registration: { plateExpirationDate: "2025-01-01", address: { state: "NJ" } },
      },
      ctx,
    );
    expect(s.verdict).toBe("issues");
    expect(s.coOwner).toBe("Smith Holdings LLC");
    expect(s.flags).toEqual([
      "Registered owner (Pat Smith, Smith Holdings LLC) does not match the seller",
      "Lienholder on record: First Bank (since 2024-06-01)",
      "State has a stop on this vehicle",
      "Registered in NJ, listing says NY",
      "Registration expired 2025-01-01",
      "Listing shows 41,000 miles but the state's last odometer reading was 68,000",
    ]);
  });
  it("matches the seller against any listed owner and reports a lease", () => {
    const s = summarizeMvr(
      {
        vehicle: { vin: "WP0AA2996XS620000" },
        owners: [
          { businessName: "Ally Financial" },
          { firstName: "Jim", lastName: "Bowen", suffix: "Jr" },
        ],
        lessor: { businessName: "Ally Financial", leaseEndDate: "2027-01-01" },
        registration: { expirationDate: "2027-01-01", address: { state: "NY" } },
      },
      ctx,
    );
    expect(s.ownerMatch).toBe("match");
    expect(s.lessor).toBe("Ally Financial");
    expect(s.flags).toEqual(["Leased vehicle; lessor on record: Ally Financial"]);
  });
  it("is pending until the record has content, unknown when processed with none", () => {
    expect(summarizeMvr({}, ctx).verdict).toBe("pending");
    expect(summarizeMvr(null, ctx).processed).toBe(false);
    const u = summarizeMvr(
      {},
      { ...ctx, inquiry: { processedDate: "2026-09-27T01:00:00Z", error: "No record found" } },
    );
    expect(u.verdict).toBe("unknown");
    expect(u.flags).toEqual(["State lookup error: No record found"]);
  });
});
