import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";

/**
 * Destiny's OAuth2 backend. Never expose the client secret, bot token,
 * or Discord user access tokens to the static GitHub Pages frontend.
 *
 * Sessions and OAuth states are in memory. Deploy exactly one instance,
 * or move these maps to a shared session store before scaling.
 */
type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};
type DiscordGuild = {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
};
type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};
type Session = {
  user: DiscordUser;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  sessionExpiresAt: number;
};
const router: IRouter = Router();
const clientId = process.env.DISCORD_CLIENT_ID || "";
const clientSecret = process.env.DISCORD_CLIENT_SECRET || "";
const redirectUri = process.env.DISCORD_REDIRECT_URI || "";
const dashboardUrl = process.env.DESTINY_DASHBOARD_URL || "https://qvxy-lab.github.io/RM_UPDATES-NEWS22/";
const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || "";
const founderIds = new Set(["1348206616973152336", "1041404091936538624"]);
const states = new Map<string, number>();
const tickets = new Map<string, { sessionId: string; expiresAt: number }>();
const sessions = new Map<string, Session>();
const STATE_TTL = 10 * 60_000;
const TICKET_TTL = 60_000;
const SESSION_TTL = 6 * 60 * 60_000;
const id = () => randomBytes(32).toString("base64url");
const ready = () => Boolean(clientId && clientSecret && redirectUri && dashboardUrl);

function cleanExpired() {
  const now = Date.now();
  for (const [key, expires] of states) if (expires < now) states.delete(key);
  for (const [key, entry] of tickets) if (entry.expiresAt < now) tickets.delete(key);
  for (const [key, entry] of sessions) if (entry.sessionExpiresAt < now) sessions.delete(key);
}

function returnToDashboard(res: Response, params: Record<string, string>) {
  const dest = new URL(dashboardUrl);
  for (const [key, value] of Object.entries(params)) dest.searchParams.set(key, value);
  dest.hash = "My%20Servers";
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.redirect(303, dest.toString());
}

async function fetchDiscord<T>(url: string, auth: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Discord API request failed (" + response.status + ")");
  return response.json() as Promise<T>;
}

async function tokenRequest(form: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    body: form,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Discord OAuth token exchange failed (" + response.status + ")");
  const data = (await response.json()) as TokenResponse;
  if (!data.access_token || !data.refresh_token) throw new Error("Invalid Discord OAuth token response");
  return data;
}

function bearer(req: Request): { key: string; session: Session } | null {
  const header = req.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const key = header.slice(7).trim();
  if (!key || key.length > 200) return null;
  const session = sessions.get(key);
  if (!session) return null;
  if (session.sessionExpiresAt <= Date.now()) { sessions.delete(key); return null; }
  return { key, session };
}

async function userAccessToken(session: Session): Promise<string> {
  if (session.tokenExpiresAt > Date.now() + 60_000) return session.accessToken;
  const form = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: session.refreshToken,
    client_id: clientId, client_secret: clientSecret,
  });
  const data = await tokenRequest(form);
  session.accessToken = data.access_token;
  session.refreshToken = data.refresh_token;
  session.tokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return session.accessToken;
}

router.get("/auth/status", (_req, res) => {
  res.json({ configured: ready(), applicationId: clientId || null, botConnected: Boolean(botToken) });
});

router.get("/auth/discord", (_req, res) => {
  if (!ready()) { res.status(503).send("Discord login is not configured on this API host."); return; }
  cleanExpired();
  const state = id();
  states.set(state, Date.now() + STATE_TTL);
  res.cookie("destiny_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/callback", maxAge: STATE_TTL });
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code",
    scope: "identify guilds", state, prompt: "consent",
  }).toString();
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, url.toString());
});

router.get("/auth/callback", async (req, res) => {
  if (!ready()) { res.status(503).send("Discord login isn't configured."); return; }
  cleanExpired();
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const expiresAt = states.get(state);
  const cookieState = typeof req.cookies?.destiny_oauth_state === "string" ? req.cookies.destiny_oauth_state : "";
  res.clearCookie("destiny_oauth_state", { path: "/api/auth/callback", sameSite: "lax", secure: true });
  if (!state || !cookieState || cookieState !== state || !expiresAt || expiresAt < Date.now()) {
    res.status(400).send("Login expired or invalid. Start again from Destiny."); return;
  }
  states.delete(state);
  if (req.query.iss && req.query.iss !== "https://discord.com") {
    res.status(400).send("Invalid OAuth issuer."); return;
  }
  if (req.query.error || !code) {
    returnToDashboard(res, { destiny_error: "Discord authorization was cancelled." }); return;
  }
  try {
    const tokens = await tokenRequest(new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: redirectUri,
      client_id: clientId, client_secret: clientSecret,
    }));
    const user = await fetchDiscord<DiscordUser>("https://discord.com/api/v10/users/@me", "Bearer " + tokens.access_token);
    const sessionId = id();
    sessions.set(sessionId, {
      user, accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
      tokenExpiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
      sessionExpiresAt: Date.now() + SESSION_TTL,
    });
    const ticket = id();
    tickets.set(ticket, { sessionId, expiresAt: Date.now() + TICKET_TTL });
    returnToDashboard(res, { destiny_ticket: ticket });
  } catch (error) {
    console.error("Destiny OAuth callback failed:", error instanceof Error ? error.message : "Unknown error");
    returnToDashboard(res, { destiny_error: "Discord login failed. Please try again." });
  }
});

router.post("/auth/exchange", (req, res) => {
  cleanExpired();
  const ticket = typeof req.body?.ticket === "string" ? req.body.ticket : "";
  const item = tickets.get(ticket);
  if (!item || !ticket || item.expiresAt < Date.now()) {
    res.status(401).json({ error: "Login link expired. Please sign in again." }); return;
  }
  tickets.delete(ticket);
  const session = sessions.get(item.sessionId);
  if (!session) { res.status(401).json({ error: "Session expired." }); return; }
  res.json({ session: item.sessionId, user: publicUser(session.user) });
});

function publicUser(user: DiscordUser) {
  return {
    id: user.id, username: user.username, globalName: user.global_name || user.username,
    avatar: user.avatar ? "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + ".png" : null,
    premiumFounder: founderIds.has(user.id),
  };
}

router.get("/auth/me", (req, res) => {
  const auth = bearer(req);
  if (!auth) { res.status(401).json({ error: "Please log in." }); return; }
  res.json({ user: publicUser(auth.session.user) });
});

router.post("/auth/logout", (req, res) => {
  const auth = bearer(req);
  if (auth) sessions.delete(auth.key);
  res.json({ ok: true });
});

router.get("/guilds", async (req, res) => {
  const auth = bearer(req);
  if (!auth) { res.status(401).json({ error: "Please log in." }); return; }
  try {
    const token = await userAccessToken(auth.session);
    const guilds = await fetchDiscord<DiscordGuild[]>("https://discord.com/api/v10/users/@me/guilds", "Bearer " + token);
    const manageable = guilds.filter((guild) => {
      let permissions = 0n;
      try { permissions = BigInt(guild.permissions || "0"); } catch { /* ignore invalid data */ }
      return Boolean(guild.owner) || (permissions & (8n | 32n)) !== 0n;
    });
    if (!botToken) {
      res.json({ guilds: manageable.map((guild) => ({
        id: guild.id, name: guild.name, icon: guild.icon || null, installed: null,
      })), botConnected: false, applicationId: clientId });
      return;
    }
    const botGuilds = await fetchDiscord<DiscordGuild[]>("https://discord.com/api/v10/users/@me/guilds", "Bot " + botToken);
    const installedIds = new Set(botGuilds.map((guild) => guild.id));
    const result = manageable.map((guild) => ({
      id: guild.id, name: guild.name, icon: guild.icon || null,
      installed: installedIds.has(guild.id),
    })).sort((a, b) => Number(b.installed) - Number(a.installed) || a.name.localeCompare(b.name));
    res.json({ guilds: result, botConnected: true, applicationId: clientId });
  } catch (error) {
    console.error("Destiny guild lookup failed:", error instanceof Error ? error.message : "Unknown error");
    res.status(502).json({ error: "Couldn't load Discord servers. Please try again shortly." });
  }
});

export default router;
