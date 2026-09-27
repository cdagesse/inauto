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
