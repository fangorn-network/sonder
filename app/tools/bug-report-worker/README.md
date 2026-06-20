# Bug-report proxy

A tiny serverless endpoint that the in-app "Report a problem" form POSTs to. It
holds a GitHub token and files an issue on your behalf — so the token never ships
inside the distributed app (whose `.env` is bundled and user-editable).

```
Sond3r app ──POST {title, body, labels}──▶  this Worker ──▶  GitHub Issues API
                                            (holds GH token)
```

If `VITE_BUGREPORT_ENDPOINT` is left blank, the app skips this and opens a
prefilled GitHub issue in the user's browser instead — so deploying this is
optional but gives the smoothest, no-GitHub-account-needed experience.

## Deploy (Cloudflare Workers)

1. **Create a token.** GitHub → Settings → Developer settings → *Fine-grained
   tokens*. Scope it to **only** the `fangorn-network/sonder` repo with
   **Issues: Read and write**. Nothing else.

2. **Publish the Worker:**
   ```bash
   cd tools/bug-report-worker
   npx wrangler deploy
   npx wrangler secret put GITHUB_TOKEN     # paste the fine-grained token
   # optional, if your repo differs from the default:
   # npx wrangler secret put GITHUB_REPO    # or set [vars] in wrangler.toml
   ```

3. **Point the app at it.** Put the deployed URL in `app/.env`:
   ```
   VITE_BUGREPORT_ENDPOINT=https://sonder-bug-report.<your-subdomain>.workers.dev
   ```

   Rebuild the app; reports now file silently and the form shows a link to the
   created issue.

## Contract

Request (`POST`, `application/json`):
```json
{ "title": "string", "body": "string", "labels": ["bug", "early-access"] }
```
Response (`201`):
```json
{ "url": "https://github.com/owner/repo/issues/123", "number": 123 }
```

## Notes / hardening

- The endpoint is public. Add a [Cloudflare rate-limiting rule] or WAF in front
  of it to blunt spam — a shared secret can't help here since anything shipped in
  the app is extractable.
- `worker.js` caps title/body length and forwards only `title`, `body`, and
  string `labels`; it never trusts other fields.
- The same `worker.js` runs on Vercel/Deno/any Fetch-API host with minor tweaks
  (read the token from that platform's env).

[Cloudflare rate-limiting rule]: https://developers.cloudflare.com/waf/rate-limiting-rules/
