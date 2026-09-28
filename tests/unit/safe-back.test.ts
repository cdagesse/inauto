import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));

const { safeBack, signInHref } = await import("@/components/account/require-signin");

describe("safeBack", () => {
  it("keeps same-origin paths, with query strings", () => {
    expect(safeBack("/admin/review", "/admin")).toBe("/admin/review");
    expect(safeBack("/admin/users/abc?page=2", "/admin")).toBe("/admin/users/abc?page=2");
  });

  it("falls back for empty, relative and absolute targets", () => {
    expect(safeBack("", "/admin")).toBe("/admin");
    expect(safeBack(undefined, "/admin")).toBe("/admin");
    expect(safeBack(null, "/admin")).toBe("/admin");
    expect(safeBack("admin/review", "/admin")).toBe("/admin");
    expect(safeBack("https://evil.example/", "/admin")).toBe("/admin");
    expect(safeBack("javascript:alert(1)", "/admin")).toBe("/admin");
  });

  it("rejects protocol-relative forms", () => {
    expect(safeBack("//evil.example", "/admin")).toBe("/admin");
    expect(safeBack("//evil.example/admin", "/admin")).toBe("/admin");
    expect(safeBack("/\\evil.example", "/admin")).toBe("/admin");
  });

  it("rejects control characters the URL parser would strip", () => {
    expect(safeBack("/\t//evil.example", "/admin")).toBe("/admin");
    expect(safeBack("/\n//evil.example", "/admin")).toBe("/admin");
    expect(safeBack("/\r//evil.example", "/admin")).toBe("/admin");
    expect(safeBack("/admin/review\u0000", "/admin")).toBe("/admin");
    expect(safeBack("/admin review", "/admin")).toBe("/admin");
  });
});

describe("signInHref", () => {
  it("uses the same rule with the garage as fallback", () => {
    expect(signInHref("/listings/1")).toBe("/signin?redirect_url=%2Flistings%2F1");
    expect(signInHref("//evil.example")).toBe("/signin?redirect_url=%2Fgarage");
  });
});
