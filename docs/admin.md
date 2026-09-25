# Admin console

`/admin` is visible only to users with `role = admin`. Signed-out visitors are sent to sign in;
signed-in non-admins get a 404 so the console's existence is not confirmed. Every mutation
re-checks the role server-side (`requireAdmin()`), which also re-reads account status so a
disabled or blocked admin stops immediately even with a valid session token.

## Granting admin

Only the CLI can grant or revoke `admin`:

```bash
pnpm users:role chris@nucar.com admin
```

The user must have signed in at least once. The change is recorded in the audit log with
`via: "cli"`. The console itself can only switch users between `user` and `dealer`.

## Pages

| Page                 | What it does                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin`             | Counts of users, listings, pending vetting, rows to review, models by report status, last 20 admin actions                                     |
| `/admin/users`       | Search by email or name; per-user page with garage (all shelves), listings, service orders, admin history                                      |
| `/admin/users/[id]`  | Disable, Block, Reactivate (reason required). Block also withdraws active listings. Role user/dealer                                           |
| `/admin/models`      | Catalog table; add a make/model with source aliases and a default "all years" generation                                                       |
| `/admin/models/[id]` | Edit model fields, generations (add/edit/delete when unreferenced), aliases, publish toggle, request report rebuild                            |
| `/admin/review`      | Outlier queue: flagged (`needs_review`) or excluded dealer/auction rows. Include, Exclude (manual), Reassign generation. Bulk select           |
| `/admin/vetting`     | Title vetting and condition report queues: Start, Mark vetted/complete, Decline (note required). Vetting a listing sets `listing.title_vetted` |
| `/admin/audit`       | Every admin action with filters                                                                                                                |

## Account status semantics

- `active`: normal.
- `disabled`: cannot sign in (Auth.js `signIn` callback) or act (`requireUser`). Listings are hidden from everyone except the owner but keep their status, so reactivation restores them.
- `blocked`: as disabled, plus active listings are withdrawn at block time.

Admins cannot change their own status or role, and cannot disable, block, or demote other admins from the console.

## Audit

`admin_action` is append-only and written inside the same transaction as the change it records.
`user.status.*`, `user.role.*`, `model.*`, `generation.*`, `alias.*`, `review.*`, `service.*`.
