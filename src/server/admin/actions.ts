"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { type ActionResult, fail, toError } from "@/server/result";
import * as modelsCore from "./core/models";
import * as review from "./core/review";
import * as usersCore from "./core/users";
import * as vetting from "./core/vetting";

/**
 * Admin server actions. Each one: validate with zod, requireAdmin(), delegate
 * to a core function that runs the change and its audit row in one
 * transaction. The `*Form` variants are for plain <form action> use and
 * redirect back with ?error= or ?ok= so the page shows the outcome.
 */
function adminError(e: unknown): { ok: false; error: string } {
  if (e instanceof Error && e.message === "FORBIDDEN") return fail("Admins only.");
  if (e instanceof Error && e.message === "ACCOUNT_DISABLED")
    return fail("Your account is not active.");
  return toError(e);
}

const uuid = z.string().uuid();
const reason = z.string().trim().min(3, "Give a reason (at least 3 characters).").max(500);
const optInt = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().min(1900).max(2100).nullable());
const optMoney = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v.replace(/[$,]/g, ""))))
  .pipe(z.number().int().min(0).max(100_000_000).nullable());
const text = (max: number) => z.string().trim().max(max);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function run(back: string, r: Promise<ActionResult | ActionResult<unknown>>, okMsg?: string) {
  const res = await r;
  const sep = back.includes("?") ? "&" : "?";
  if (!res.ok) redirect(`${back}${sep}error=${encodeURIComponent(res.error)}`);
  redirect(`${back}${sep}ok=${encodeURIComponent(okMsg ?? "Done.")}`);
}

/* ---------------- users ---------------- */

export async function setUserStatus(fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const p = z
      .object({ id: uuid, status: z.enum(["active", "disabled", "blocked"]), reason })
      .safeParse({ id: str(fd, "id"), status: str(fd, "status"), reason: str(fd, "reason") });
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
    const r = await usersCore.setUserStatus(admin.id, p.data.id, p.data.status, p.data.reason);
    if (r.ok) {
      revalidatePath(`/admin/users/${p.data.id}`);
      revalidatePath("/listings");
    }
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function setUserStatusForm(fd: FormData) {
  await run(`/admin/users/${str(fd, "id")}`, setUserStatus(fd), "Account status updated.");
}

export async function setUserRole(fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const p = z
      .object({ id: uuid, role: z.enum(["user", "dealer", "admin"]) })
      .safeParse({ id: str(fd, "id"), role: str(fd, "role") });
    if (!p.success) return fail("Invalid input.");
    const r = await usersCore.setUserRole(admin.id, p.data.id, p.data.role);
    if (r.ok) revalidatePath(`/admin/users/${p.data.id}`);
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function setUserRoleForm(fd: FormData) {
  await run(`/admin/users/${str(fd, "id")}`, setUserRole(fd), "Role updated.");
}

/* ---------------- models ---------------- */

const generationSchema = z.object({
  id: uuid.optional(),
  code: text(24).min(1, "Generation code is required."),
  name: text(60).min(1, "Generation name is required."),
  yearStart: z.coerce.number().int().min(1900).max(2100),
  yearEnd: z.coerce.number().int().min(1900).max(2100),
  originalMsrp: optMoney,
  engine: text(80),
  hp: text(40),
  gearbox: text(80),
  notes: text(500),
  packages: text(200).transform((v) =>
    v
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function createModel(fd: FormData): Promise<ActionResult<{ modelId: string }>> {
  try {
    const admin = await requireAdmin();
    const p = z
      .object({
        makeName: text(60).min(1, "Make is required."),
        name: text(80).min(1, "Model is required."),
        shortName: text(40),
        parentLine: text(60),
        yearStart: optInt,
        yearEnd: optInt,
        visorMake: text(60),
        visorModel: text(80),
        visorTrim: text(120),
        ocdMake: text(60),
        ocdModel: text(80),
      })
      .safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
    const d = p.data;
    const r = await modelsCore.createModel(admin.id, {
      makeName: d.makeName,
      name: d.name,
      shortName: d.shortName || null,
      parentLine: d.parentLine || null,
      yearStart: d.yearStart,
      yearEnd: d.yearEnd,
      visor:
        d.visorMake && d.visorModel
          ? { rawMake: d.visorMake, rawModel: d.visorModel, rawTrimPattern: d.visorTrim || null }
          : null,
      ocd: d.ocdMake && d.ocdModel ? { rawMake: d.ocdMake, rawModel: d.ocdModel } : null,
    });
    if (r.ok) revalidatePath("/admin/models");
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function createModelForm(fd: FormData) {
  const r = await createModel(fd);
  if (!r.ok) redirect(`/admin/models?error=${encodeURIComponent(r.error)}`);
  redirect(`/admin/models/${r.data.modelId}?ok=${encodeURIComponent("Model created.")}`);
}

export async function updateModel(fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const p = z
      .object({
        id: uuid,
        name: text(80).min(1),
        shortName: text(40),
        parentLine: text(60),
        yearStart: optInt,
        yearEnd: optInt,
      })
      .safeParse({
        id: str(fd, "id"),
        name: str(fd, "name"),
        shortName: str(fd, "shortName"),
        parentLine: str(fd, "parentLine"),
        yearStart: str(fd, "yearStart"),
        yearEnd: str(fd, "yearEnd"),
      });
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
    const { id, ...patch } = p.data;
    const r = await modelsCore.updateModel(admin.id, id, patch);
    if (r.ok) revalidatePath(`/admin/models/${id}`);
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function updateModelForm(fd: FormData) {
  await run(`/admin/models/${str(fd, "id")}`, updateModel(fd), "Model saved.");
}

export async function setModelPublished(fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const p = z
      .object({ id: uuid, published: z.enum(["true", "false"]) })
      .safeParse({ id: str(fd, "id"), published: str(fd, "published") });
    if (!p.success) return fail("Invalid input.");
    const r = await modelsCore.updateModel(admin.id, p.data.id, {
      published: p.data.published === "true",
    });
    if (r.ok) {
      revalidatePath(`/admin/models/${p.data.id}`);
      revalidatePath("/markets");
    }
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function setModelPublishedForm(fd: FormData) {
  await run(`/admin/models/${str(fd, "id")}`, setModelPublished(fd), "Visibility updated.");
}

export async function requestModelReport(fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const p = uuid.safeParse(str(fd, "id"));
    if (!p.success) return fail("Invalid input.");
    const r = await modelsCore.requestModelReport(admin.id, p.data);
    if (r.ok) revalidatePath(`/admin/models/${p.data}`);
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function requestModelReportForm(fd: FormData) {
  await run(
    `/admin/models/${str(fd, "id")}`,
    requestModelReport(fd),
    "Report rebuild requested. The next job run will pick it up.",
  );
}

export async function upsertGeneration(fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const modelId = uuid.safeParse(str(fd, "modelId"));
    if (!modelId.success) return fail("Invalid model.");
    const raw = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
    if (!raw.id) delete raw.id;
    const p = generationSchema.safeParse(raw);
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
    if (p.data.yearEnd < p.data.yearStart) return fail("Year end must not precede year start.");
    const r = await modelsCore.upsertGeneration(admin.id, modelId.data, p.data);
    if (r.ok) revalidatePath(`/admin/models/${modelId.data}`);
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function upsertGenerationForm(fd: FormData) {
  await run(`/admin/models/${str(fd, "modelId")}`, upsertGeneration(fd), "Generation saved.");
}

export async function deleteGeneration(fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const p = z
      .object({ modelId: uuid, id: uuid })
      .safeParse({ modelId: str(fd, "modelId"), id: str(fd, "id") });
    if (!p.success) return fail("Invalid input.");
    const r = await modelsCore.deleteGeneration(admin.id, p.data.modelId, p.data.id);
    if (r.ok) revalidatePath(`/admin/models/${p.data.modelId}`);
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function deleteGenerationForm(fd: FormData) {
  await run(`/admin/models/${str(fd, "modelId")}`, deleteGeneration(fd), "Generation deleted.");
}

export async function upsertAlias(fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const p = z
      .object({
        modelId: uuid,
        id: uuid.optional(),
        source: z.enum(["visor", "ocd"]),
        rawMake: text(60).min(1, "Source make is required."),
        rawModel: text(80).min(1, "Source model is required."),
        rawTrimPattern: text(120),
      })
      .safeParse({
        modelId: str(fd, "modelId"),
        id: str(fd, "id") || undefined,
        source: str(fd, "source"),
        rawMake: str(fd, "rawMake"),
        rawModel: str(fd, "rawModel"),
        rawTrimPattern: str(fd, "rawTrimPattern"),
      });
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
    const { modelId, ...alias } = p.data;
    const r = await modelsCore.upsertAlias(admin.id, modelId, alias);
    if (r.ok) revalidatePath(`/admin/models/${modelId}`);
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function upsertAliasForm(fd: FormData) {
  await run(`/admin/models/${str(fd, "modelId")}`, upsertAlias(fd), "Alias saved.");
}

export async function deleteAlias(fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const p = z
      .object({ modelId: uuid, id: uuid })
      .safeParse({ modelId: str(fd, "modelId"), id: str(fd, "id") });
    if (!p.success) return fail("Invalid input.");
    const r = await modelsCore.deleteAlias(admin.id, p.data.modelId, p.data.id);
    if (r.ok) revalidatePath(`/admin/models/${p.data.modelId}`);
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function deleteAliasForm(fd: FormData) {
  await run(`/admin/models/${str(fd, "modelId")}`, deleteAlias(fd), "Alias deleted.");
}

/* ---------------- outlier review ---------------- */

export async function reviewRows(fd: FormData): Promise<ActionResult<{ count: number }>> {
  try {
    const admin = await requireAdmin();
    const p = z
      .object({
        source: z.enum(["dealer", "auction"]),
        decision: z.enum(["include", "exclude"]),
        ids: z.array(uuid).min(1, "Select at least one row.").max(200),
      })
      .safeParse({
        source: str(fd, "source"),
        decision: str(fd, "decision"),
        ids: fd.getAll("ids").map(String),
      });
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
    const r = await review.setRowsIncluded(
      admin.id,
      p.data.source,
      p.data.ids,
      p.data.decision === "include",
    );
    if (r.ok) revalidatePath("/admin/review");
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function reviewRowsForm(fd: FormData) {
  const back = str(fd, "back") || "/admin/review";
  const r = await reviewRows(fd);
  const sep = back.includes("?") ? "&" : "?";
  if (!r.ok) redirect(`${back}${sep}error=${encodeURIComponent(r.error)}`);
  redirect(`${back}${sep}ok=${encodeURIComponent(`${r.data.count} rows updated.`)}`);
}

export async function reassignGeneration(fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const p = z
      .object({ source: z.enum(["dealer", "auction"]), id: uuid, generationId: uuid })
      .safeParse({
        source: str(fd, "source"),
        id: str(fd, "id"),
        generationId: str(fd, "generationId"),
      });
    if (!p.success) return fail("Pick a generation.");
    const r = await review.reassignGeneration(
      admin.id,
      p.data.source,
      p.data.id,
      p.data.generationId,
    );
    if (r.ok) revalidatePath("/admin/review");
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function reassignGenerationForm(fd: FormData) {
  await run(str(fd, "back") || "/admin/review", reassignGeneration(fd), "Generation reassigned.");
}

/* ---------------- service orders ---------------- */

export async function serviceOrderAction(fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const p = z
      .object({
        id: uuid,
        action: z.enum(["start", "complete", "decline"]),
        note: text(1000),
        reportUrl: z.union([z.literal(""), z.string().url().startsWith("https://")]),
      })
      .safeParse({
        id: str(fd, "id"),
        action: str(fd, "action"),
        note: str(fd, "note"),
        reportUrl: str(fd, "reportUrl"),
      });
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
    const { id, action, note, reportUrl } = p.data;
    if (action === "decline" && note.length < 3) return fail("A note is required to decline.");
    const r =
      action === "start"
        ? await vetting.startServiceOrder(admin.id, id)
        : action === "complete"
          ? await vetting.completeServiceOrder(admin.id, id, note || null, reportUrl || null)
          : await vetting.declineServiceOrder(admin.id, id, note);
    if (r.ok) {
      revalidatePath("/admin/vetting");
      revalidatePath("/tools");
    }
    return r;
  } catch (e) {
    return adminError(e);
  }
}
export async function serviceOrderActionForm(fd: FormData) {
  await run(str(fd, "back") || "/admin/vetting", serviceOrderAction(fd), "Order updated.");
}
