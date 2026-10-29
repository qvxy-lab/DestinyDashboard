# Destiny Discord Login API

The **Discord login and multi-server listing implementation** lives in `src/routes/discord.ts`. The static dashboard is deployed through GitHub Pages. The API **must** run on a separate publicly reachable HTTPS server because GitHub Pages cannot execute backend code.

## Configure the Discord app

In the Discord Developer Portal, open the application for the Destiny bot. The Destiny **Application ID is `1388987529537126500`** and is already set as the default `DISCORD_CLIENT_ID`. Under OAuth2, register the **Redirect URL** exactly as `https://YOUR-API-HOST/api/auth/callback` (replace the API host with your real host). The requested login scopes are `identify guilds`. Do not post the client secret or bot token in chat or commit them to GitHub.

## Runtime configuration

Set these on your **backend host**, not the static site:

| Environment variable | Purpose |
| --- | --- |
| `PORT` | Port listened to by the Node server |
| `DISCORD_CLIENT_ID` | Public bot application ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret, private |
| `DISCORD_REDIRECT_URI` | Your backend's public HTTPS `/api/auth/callback` URL, also registered with Discord |
| `DESTINY_DASHBOARD_URL` | `https://qvxy-lab.github.io/DestinyDashboard/` |
| `DISCORD_BOT_TOKEN` | Bot token, **private**, required to reliably identify servers with the bot installed |

Deploy `api-server` on a host supporting Node 22+ and HTTPS, with an HTTPS public URL. Install the workspace dependencies and build/start the API service, for example from the repository root:

```bash
corepack pnpm install --no-frozen-lockfile
corepack pnpm --filter @workspace/api-server build
corepack pnpm --filter @workspace/api-server start
```

Use your host's startup/build commands; these are examples, not something GitHub Pages can execute. Verify `https://YOUR-API-HOST/api/healthz` and `https://YOUR-API-HOST/api/auth/status` respond; `configured: true` is required before sign-in.

**Then:** Set the public `DESTINY_API_URL` GitHub Actions **repository variable** in `qvxy-lab/DestinyDashboard` to your backend's HTTPS origin, e.g. `https://YOUR-API-HOST` (do NOT add `/api`). Re-run the **Deploy Destiny Dashboard** action on the `main` branch. Only this *public URL* is injected into GitHub Pages.

## Endpoints

- `GET /api/auth/discord`: begins Discord OAuth2 with CSRF state.
- `GET /api/auth/callback`: exchanges the temporary code server-side and redirects to the dashboard with a single-use, 60-second ticket.
- `POST /api/auth/exchange`: consumes the ticket and returns an opaque session ID for the current browser session.
- `GET /api/auth/me`: returns authorized Discord identity.
- `GET /api/guilds`: returns the logged-in user's manageable servers, split by whether the bot is installed when the bot token is configured.
- `POST /api/auth/logout`: ends the session.
- `GET /api/auth/status`: public status with no credentials.

The backend holds Discord user tokens **server-side**, never in a public page. Frontend session keys are stored in browser sessionStorage and expire on the backend after six hours. Only managers/administrators/server owners appear in the server list. OAuth state is tied to a secure SameSite cookie.

## Important limitations

- This is **real login and server discovery code, not an active deployment**. The service cannot become live until a public API hostname, Application ID and private secrets are configured on the backend host.
- Server settings forms are still previews. This API deliberately does **not** pretend to save or apply bot settings yet, nor does it write unrelated guild configurations. A separate bot-safe config bridge is needed to apply settings to the actual running bot, with permissions verified on every write.
- The in-memory session and OAuth state stores assume **one backend instance**. For multi-instance/production resilience, move them to a persistent shared store (e.g. Redis) before scaling.
- Founder Premium status is computed on the server from authorized Discord account IDs, but payment, subscriptions, and AI daily limits are not enabled yet.
