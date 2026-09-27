# Title vetting through Vitu

Buyers can order a title check on a listing (service order kind `title_vetting`). The
`title-vetting` cron (every 10 minutes) fulfils it through two Vitu products, each an
asynchronous inquiry that is created once, stored on the order, and read back on later runs
or when Vitu's notification webhook fires:

- **NMVTIS vehicle history** (`VITU_NMVTIS_ENABLED`, on by default once credentials exist):
  `POST {VITU_NMVTIS_API_BASE}/inquiry` with `{ refNumber (our UUID), vin }` → `{ inquiryId }`,
  stored in `details.nmvtis`. Later, `GET /inquiry/id/{inquiryId}` gives `processedDate` / `error`
  and `GET /inquiry/{inquiryId}/record` gives `InquiryRecordDTO`, summarised into `result.summary`:

  | Check                      | Source                                                                           | Flag when                                                    |
  | -------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
  | Brands                     | `vehicleBrands[]` (`BrandEnum`: Salvage, Rebuilt, Flood, Junk, odometer brands…) | any brand except the "Actual Mileage" / "Exempt" disclosures |
  | Junk / salvage / insurance | `vehicleDisposition[]`                                                           | any record (with reporting entity and date)                  |
  | Title history              | `title[]` + `previousTitle[]` (state, issue date, odometer), newest first        | odometer readings decrease over time                         |
  | Odometer vs listing        | latest title `odometerReading` vs listing miles                                  | listing shows 500+ fewer miles                               |
  | VIN                        | `vehicle[].vin`                                                                  | differs from the listing VIN                                 |

  NMVTIS has no theft or lien data; liens come from the MVR record below. A PDF of the report is
  available from `GET /inquiry/{inquiryId}/report` (not surfaced yet).

- **MVR registration record** (`VITU_MVR_ENABLED=true`), described below.

The order completes when every enabled part has a result. The listing is marked title-vetted only
when every part passes (NMVTIS `clean`, MVR `verified`).

## Admin VIN tester

`/admin/vitu` lets an admin enter a VIN, state, optional seller name and listing miles. It creates
a title-vetting order with no listing (`details.test`), runs the job for it immediately, and shows
the same card buyers see plus the raw Vitu responses. Use **Refresh** to poll; the notification
webhook also completes it. Every run creates real, billable inquiries.

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

### Notifications

Each Vitu API has a matching Notifications product, served from the same base URL, with the same calls: `PUT /subscription?callbackUrl=`,
`GET /subscription`, `DELETE /subscription`, and `PUT /security/callback` to register an HMAC key. Vitu then signs
every callback with base64 HMAC-SHA256 of the body in the `X-HMAC` header. Register ours once per product with the
cron secret:

```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://inauto-nu.vercel.app/api/jobs/vitu-subscribe?product=mvr"
```

(`GET` shows the current subscription, `DELETE` removes it; `product=nmvtis` targets the NMVTIS product.)

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
