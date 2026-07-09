# Getting Started

## What you're looking at

The Geektastic MCP Server has two "front doors":

- **The Web UI** (`https://<your-host>/`) — a dashboard you log into with a
  username and password, where admins configure everything and any logged-in
  user can browse activity and try tools out.
- **The MCP endpoint** (`https://<your-host>/mcp`) — not meant to be opened in a
  browser. This is what Claude (or another MCP client) talks to. See
  [Connecting an MCP Client](04-Connecting-MCP-Clients.md).

## Logging in for the first time

There is no public sign-up. Accounts are created in one of two ways:

- **The bootstrap admin.** The very first time the server starts (empty
  database), it creates one admin account from the `ADMIN_USERNAME` /
  `ADMIN_PASSWORD` values your operator configured. If you're the operator, see
  [Deployment](../Tech_Docs/08-Deployment.md) in the technical docs for how those
  are set.
- **An admin creates your account.** Go to **Users** (admin only) → "Add user",
  and hand the new user their username and a temporary password out of band.

Either way, open the site, enter your username and password on the login
screen, and sign in.

## Changing your password

If your account was just created by an admin (or you're using a temporary
password), the UI will show a banner on the **Profile** page: *"Your password
was set by an admin. Please choose a new one."* Go to **Profile** → **Change
password**, enter your current password and a new one (minimum 8 characters),
and submit. This clears the "must change password" flag.

You can change your password at any time from **Profile**, not just when
prompted.

## Roles

Every account is either an **admin** or a **member**:

| Capability | Member | Admin |
|---|---|---|
| View the Dashboard | ✅ | ✅ |
| Use the Testing Playground | ✅ (enabled tools only) | ✅ |
| View tool-call Logs | ✅ | ✅ |
| Manage own Profile / password | ✅ | ✅ |
| Manage Connections (add/edit/delete/test) | ❌ | ✅ |
| Enable/disable individual Tools | ❌ | ✅ |
| Create/revoke MCP Tokens | ❌ | ✅ |
| Register/revoke OAuth Clients | ❌ | ✅ |
| Manage Users (create, roles, disable, reset password) | ❌ | ✅ |

The left-hand navigation automatically hides admin-only pages for member
accounts, and the server also rejects those requests directly (not just a UI
restriction) if a member somehow lands on an admin URL.

## Session basics

- Signing in issues a browser session cookie good for 7 days of inactivity.
- **Log out** from the bottom of the sidebar when you're done on a shared machine.
- If a disabled account tries to log in, or an already-logged-in account is
  disabled by an admin, login fails / the session stops working — see
  [Troubleshooting](06-Troubleshooting.md).

## Where to go next

- If you're an admin setting this server up for the first time: go to
  [Administrator Guide](02-Admin-Guide.md) and start with **Connections**.
- If someone else already set it up and you just want to try tools or check
  activity: go to [User Guide](03-User-Guide.md).
- If you're ready to actually connect Claude: go to
  [Connecting an MCP Client](04-Connecting-MCP-Clients.md).
