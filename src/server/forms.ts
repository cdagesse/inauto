"use server";

import { redirect } from "next/navigation";
import { addGarageCar, deleteGarageCar, moveGarageCar } from "./garage";
import { markListingSold, publishListing, withdrawListing } from "./listings";
import { revokeInvite } from "./networks";
import type { ActionResult } from "./result";

/**
 * Void wrappers for plain <form action> use in server components. A failure
 * redirects back to the page with ?error= so the user sees why.
 */
async function run(
  back: string,
  r: Promise<{ ok: true } | { ok: false; error: string } | ActionResult>,
) {
  const res = await r;
  if (!res.ok)
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(res.error)}`);
}

export async function addGarageCarForm(fd: FormData) {
  await run("/garage", addGarageCar(fd));
}
export async function moveGarageCarForm(fd: FormData) {
  await run("/garage", moveGarageCar(fd));
}
export async function deleteGarageCarForm(fd: FormData) {
  await run("/garage", deleteGarageCar(fd));
}
export async function publishListingForm(fd: FormData) {
  await run(`/listings/${String(fd.get("id"))}`, publishListing(fd));
}
export async function withdrawListingForm(fd: FormData) {
  await run(`/listings/${String(fd.get("id"))}`, withdrawListing(fd));
}
export async function markListingSoldForm(fd: FormData) {
  await run(`/listings/${String(fd.get("id"))}`, markListingSold(fd));
}
export async function revokeInviteForm(fd: FormData) {
  await run("/networks", revokeInvite(fd));
}
