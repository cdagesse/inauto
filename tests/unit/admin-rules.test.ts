import { describe, expect, it } from "vitest";
import {
  normalizeQuery,
  parsePage,
  roleChangeError,
  serviceTransitionError,
  statusChangeError,
} from "@/server/admin/rules";

const admin = { id: "a", role: "admin" as const };
const user = { id: "u", role: "user" as const, status: "active" as const };

describe("admin status rules", () => {
  it("lets an admin disable, block and reactivate an ordinary user", () => {
    expect(statusChangeError(admin, user, "disabled")).toBeNull();
    expect(statusChangeError(admin, user, "blocked")).toBeNull();
    expect(statusChangeError(admin, { ...user, status: "blocked" }, "active")).toBeNull();
  });
  it("refuses self-targeting", () => {
    expect(statusChangeError(admin, { ...user, id: "a", role: "admin" }, "disabled")).toMatch(
      /own account/,
    );
  });
  it("refuses targeting other admins", () => {
    expect(statusChangeError(admin, { ...user, role: "admin" }, "blocked")).toMatch(
      /Admin accounts/,
    );
  });
  it("refuses no-op transitions", () => {
    expect(statusChangeError(admin, user, "active")).toMatch(/already active/);
  });
  it("refuses non-admin actors", () => {
    expect(statusChangeError({ id: "x", role: "dealer" }, user, "blocked")).toBe("Admins only.");
  });
});

describe("admin role rules", () => {
  it("allows user <-> dealer", () => {
    expect(roleChangeError(admin, user, "dealer")).toBeNull();
    expect(roleChangeError(admin, { ...user, role: "dealer" }, "user")).toBeNull();
  });
  it("routes admin promotion and demotion to the CLI", () => {
    expect(roleChangeError(admin, user, "admin")).toMatch(/CLI/);
    expect(roleChangeError(admin, { ...user, role: "admin" }, "user")).toMatch(/CLI/);
  });
  it("refuses self and no-ops", () => {
    expect(roleChangeError(admin, { ...user, id: "a", role: "admin" }, "user")).toMatch(/own role/);
    expect(roleChangeError(admin, user, "user")).toMatch(/already/);
  });
});

describe("service order transitions", () => {
  it("only open orders move", () => {
    expect(serviceTransitionError("requested", "start")).toBeNull();
    expect(serviceTransitionError("requested", "complete")).toBeNull();
    expect(serviceTransitionError("in_progress", "decline")).toBeNull();
    expect(serviceTransitionError("in_progress", "start")).toMatch(/already in progress/);
    expect(serviceTransitionError("complete", "decline")).toMatch(/already complete/);
    expect(serviceTransitionError("declined", "complete")).toMatch(/already declined/);
  });
});

describe("search param helpers", () => {
  it("bounds page numbers", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(parsePage("x")).toBe(1);
    expect(parsePage("1e9")).toBe(1);
  });
  it("escapes ILIKE wildcards and caps length", () => {
    expect(normalizeQuery("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(normalizeQuery("a".repeat(200))).toHaveLength(80);
  });
});
