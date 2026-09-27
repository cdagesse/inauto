# Title vetting through Vitu

Title-vetting orders (`service_order.kind = title_vetting`) are fulfilled automatically by
`src/jobs/title-vetting.ts`, run by the `/api/jobs/title-vetting` cron every 10 minutes.

## Auth

OAuth 2.0 client credentials against Vitu's Keycloak realm, form-encoded, `scope=oneapi:access`
(per Vitu's migration guide). Tokens are cached in memory until a minute before expiry.

| Environment | Token URL                                                               | API base                     |
| ----------- | ----------------------------------------------------------------------- | ---------------------------- |
| Sandbox     | `https://auth.test.vitu.com/realms/api/protocol/openid-connect/token`   | `https://api-test.vitu.com`  |
| Stage       | `https://auth.stage.vitu.com/realms/api/protocol/openid-connect/token`  | `https://api-stage.vitu.com` |
| Production  | `https://auth.secure.vitu.com/realms/api/protocol/openid-connect/token` | `https://api.vitu.com`       |

Sandbox credentials for personal accounts expire after 30 days; regenerate them in Key Management.

## Configuration

`VITU_CLIENT_ID`, `VITU_CLIENT_SECRET`, and `VITU_TITLE_PATH` (the NMVTIS / theft-and-lien report
endpoint from the API spec in the developer portal; `{vin}` is substituted, else the VIN is sent as
`{"vin": …}` for POST or `?vin=` for GET). Until `VITU_TITLE_PATH` is set the job idles and admins
keep completing orders by hand. Override `VITU_AUTH_URL`, `VITU_API_BASE`, `VITU_SCOPE`,
`VITU_TITLE_METHOD` for stage/production.

## What is stored

- `service_order.details.report`: the raw response.
- `service_order.result.summary`: our `TitleSummary` (brands, theft, liens, last title state and
  odometer, flags, verdict), built by `parseTitleReport()` with tolerant key matching. Tighten the
  mapping once the spec's field names are known.
- A clean verdict marks the listing `title_vetted`; issues leave it unvetted and show the flags.

The buyer who ordered the check and the listing owner see the result on the listing page.

## Registration record (MVR) verification

Alongside the NMVTIS title report, an order can pull the live state DMV record through
Vitu's **Motor Vehicle Record (MVR) Verification** API. This answers the questions a title
report cannot: who the state currently has as the registered owner, whether a lienholder or
lessor is on file, and whether the registration state and expiry agree with the listing.

### How it runs

1. The `title-vetting` cron (every 10 minutes) finds requested orders. For each one with a
   usable VIN and a two-letter state in the listing location, it creates an inquiry:
   `POST {VITU_MVR_API_BASE}/inquiry` with `{ state, refNumber (our UUID), inquiryString (VIN),
inquiryType: "VIN" }`, plus any per-state extras from `VITU_MVR_STATE_EXTRAS`. The inquiry id
   and reference number are stored in `service_order.details.mvr` and the order moves to
   `in_progress`.
2. Vitu processes the inquiry asynchronously. On later runs (or when Vitu's notification
   subscription calls `POST /api/webhooks/vitu?key=VITU_WEBHOOK_KEY` with our `refNumber`), the
   job loads the unified record (`VITU_MVR_UNIFIED_PATH` with `{id}` substituted) and, once
   `processedDate` is set, summarises it into `result.mvr`.
3. The order completes when every configured check (NMVTIS and/or MVR) has a result. The
   listing is marked title-vetted when NMVTIS is clean, or, when only MVR is configured, when
   the MVR verdict is `verified`.

### What the summary checks

| Check                      | Source                                                                                  | Flag when                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Registered owner vs seller | `owner`, `coOwner` vs `listing.seller_details.legalName` (or the seller's account name) | last name or first name disagree (nicknames like Jim/James count as a match) |
| Lien                       | `lienholder`                                                                            | any lienholder on record                                                     |
| Lease                      | `lessor`                                                                                | any lessor on record                                                         |
| Registration state         | `registration.state`                                                                    | differs from the state in the listing location                               |
| Registration expiry        | `registration.expirationDate`                                                           | in the past                                                                  |
| VIN                        | `vehicle.vin`                                                                           | differs from the listing VIN                                                 |
| Inquiry error              | `error` on the inquiry                                                                  | state returned an error                                                      |

The webhook only uses the `refNumber` to find the order and then reads the record back from
Vitu itself, so a forged callback cannot inject data. The record and inquiry responses are
stored in `details` for audit; the buyer-facing card shows only the summary.

### Environment

| Variable                    | Purpose                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `VITU_MVR_ENABLED`          | `true` to create MVR inquiries                                                                       |
| `VITU_MVR_API_BASE`         | defaults to the sandbox `https://api-test.vitu.com/lookup-national-vr-public-api/v1`                 |
| `VITU_MVR_CREATE_PATH`      | defaults to `/inquiry`                                                                               |
| `VITU_MVR_UNIFIED_PATH`     | LoadUnifiedInquiryRecord path with `{id}`; until set, inquiries are created but not read back        |
| `VITU_MVR_LOAD_BY_REF_PATH` | LoadInquiryByRefNumber path with `{ref}` (optional)                                                  |
| `VITU_MVR_LOCATION_ID`      | sent as `x-location-id` when the Vitu account has several locations                                  |
| `VITU_MVR_STATE_EXTRAS`     | JSON of per-state extra inquiry fields, e.g. `{"TX":{"dealerNumber":150786,"sellerUserName":"..."}}` |
| `VITU_WEBHOOK_KEY`          | shared secret for the notification webhook URL                                                       |

The MVR API is a paid, per-inquiry product and the state charges on completion; the job creates
at most one inquiry per order.
