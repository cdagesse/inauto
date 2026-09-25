import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Clerk session handling at the edge. Pages guard themselves server-side; the
 * routes below additionally redirect signed-out visitors to sign-in before any
 * rendering happens. Cron, health, search and outbound-click routes never run
 * through Clerk (see the matcher), so bearer-guarded jobs stay independent.
 */
const isProtected = createRouteMatcher(["/admin(.*)", "/garage(.*)", "/sell(.*)", "/networks(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Everything except Next internals, static assets, and routes that must stay Clerk-free.
    "/((?!_next|api/jobs|api/health|api/search|api/webhooks|go/|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/api/(valuation|upload)(.*)",
  ],
};
