# Troubleshooting

## "Invalid username or password" on login

- Check for typos, and that Caps Lock isn't on.
- The account may be **disabled** — ask an admin to check **Users** and
  re-enable it.
- If you're the operator and nobody can log in at all on a brand-new
  deployment, confirm the bootstrap admin actually seeded (check server logs
  for `[bootstrap] Created initial admin user "..."` on first startup) and that
  you're using the `ADMIN_USERNAME`/`ADMIN_PASSWORD` values configured for that
  deployment.

## I keep getting logged out / "Not authenticated" right after logging in

This server sets a `Secure` session cookie only when it's told a TLS-terminating
reverse proxy sits in front of it (`TRUST_PROXY=true`). If the server is
reachable over **plain HTTP** (no reverse proxy, no TLS) while `TRUST_PROXY` is
left `false`, login itself works but the cookie won't be sent back on the next
request, so everything past login looks unauthenticated. This is an operator
configuration issue — see
[Tech_Docs/08-Deployment.md](../Tech_Docs/08-Deployment.md) for the fix
(`TRUST_PROXY=true` once a reverse proxy with TLS is actually in front of the
server).

## "Invalid or missing CSRF token"

This should self-resolve on its own within the same session — the client
refreshes its CSRF token automatically right after login. If you still hit
this:
- Reload the page and retry the action.
- If it persists across reloads, check whether cookies are being blocked for
  this site (browser privacy settings, or a proxy stripping `Set-Cookie`).

## A connection shows "Unavailable" / not Healthy

The detail text next to the status **is** the actual error from Geektastic
Realms (or a network failure reaching it) — read it first. Common causes:
- Wrong **Base URL** — it should be the instance's root origin only, e.g.
  `https://realms.example.com`, with **no** `/api` suffix.
- Wrong or revoked **API key** — regenerate one from that world's "General API
  Access" panel in Geektastic Realms and update the connection.
- Geektastic Realms itself is down or unreachable from this server (network/
  firewall issue between the two).

Use the **Test** button on the connection to re-check without waiting for the
next auto-refresh.

## A tool doesn't show up in Claude / the Testing Playground

Check, in order:
1. Is the **connection** it belongs to enabled? (**Connections** page)
2. Is the **tool itself** enabled? (**Tools** page)
3. Did the MCP client reconnect/refresh its tool list since the change? Most
   clients pick this up on the next request automatically, but some cache the
   tool list per-session — try reconnecting the client if it still doesn't show.

## A tool call fails

Check **Logs** for the exact error — it includes what Geektastic Realms itself
returned (e.g. "entry not found", validation errors on a `custom_fields` value,
etc.), not just a generic failure. If the same call succeeds from the
**Testing Playground** with the same inputs, the problem is specific to how the
MCP client is constructing the call.

## `gr_get_module` doesn't show a scene's text

This is expected — `gr_get_module` returns a lightweight outline only. Use
`gr_get_section` (module id + section id) to fetch a specific Act/Chapter/
Scene's actual body text, encounters, and handouts.

## Updating an encounter cleared its adversaries

`gr_update_encounter` (and `gr_create_encounter`) **replace** the entire
adversaries list with whatever is sent — they don't merge or append. Fetch the
current list first (`gr_get_section` returns each encounter's resolved
adversaries) and include the ones you want to keep alongside any new ones.

## An OAuth-connected client (Claude Desktop/Claude.ai) suddenly stopped working

Check **OAuth Clients** — if an admin revoked that client (or it was never
approved), reconnect the Custom Connector from Claude's side to go through
registration/consent again.

## Still stuck

Check **Logs** for the relevant tool/timeframe first — most issues leave a
clear error there. If you're the operator, server-side details beyond what's
in Logs are in the container's stdout/stderr (see
[Tech_Docs/08-Deployment.md](../Tech_Docs/08-Deployment.md)).
