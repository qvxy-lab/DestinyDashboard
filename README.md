# Destiny Control Center

Official homepage: https://qvxy-lab.github.io/DestinyDashboard/

## Deployment architecture

- **Frontend:** GitHub Pages serves the static landing page, dashboard, documents and shop.
- **Production API:** `https://destiny.fadehost.app` (or the configured `DESTINY_API_URL`). The live API currently runs inside the Destiny Discord bot process through `destiny-oauth.js`.
- **Discord credentials:** `DISCORD_TOKEN` and `DISCORD_CLIENT_SECRET` remain private FadeHost environment variables. Never place them in this repository or in GitHub Pages.
- **Authentication:** Discord OAuth2 uses a short-lived, single-use login ticket, followed by an opaque server-side session. Sessions are held in memory for one bot instance and expire after six hours; restarting the bot invalidates active dashboard sessions.
- **Authorization:** Dashboard reads and writes are scoped to one guild. The API rechecks the signed-in user's current membership and Manage Server / Administrator permission on each request.

The repository also contains an Express/TypeScript `api-server/` scaffold. **It is not the API currently used by the published dashboard.** Do not deploy it as a replacement or move production credentials to it without a deliberate migration plan.

## Pages

- `index.html`: animated landing page and Destiny eagle branding.
- `dashboard.html`: Discord login, manageable server discovery and server configuration.
- `documents.html`: getting-started guide and command reference.
- `shop.html`: current plan information and planned Premium features.
- `assets/`: visual assets and dashboard enhancements.

## Live dashboard modules

The current bot-hosted API supports:

- **Welcome & Goodbye:** read and save per-server channels, messages and image-card options.
- **Unsecured Role:** configure the role-expiry rule per server.
- **Autoroles:** configure human and bot autoroles.
- **Nickname Sync:** configure role-based nickname rules on supported servers.

Other dashboard sections are previews or read-only until their bot-side adapters and permission-checked APIs are implemented. The dashboard should never display a successful save unless the API confirms it.

## Deployment

The GitHub Pages workflow deploys the static site from `main`. It injects only the public API origin through the `DESTINY_API_URL` repository variable (default: `https://destiny.fadehost.app`). The OAuth service must be running on FadeHost and Discord's redirect URL must match the configured HTTPS callback.

The current API is designed for a single bot-host instance. A shared persistent session store and a separate API service will be required before horizontally scaling it.

Never commit Discord Client Secrets, bot tokens, user access tokens, or production data.
