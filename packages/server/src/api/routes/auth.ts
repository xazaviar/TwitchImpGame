/**
 * Twitch OAuth routes for bot, broadcaster, and viewer authorization.
 *
 * Flow:
 *   1. Visit /api/auth/bot         -> redirects to Twitch OAuth (bot scopes)
 *   2. Visit /api/auth/broadcaster  -> redirects to Twitch OAuth (broadcaster scopes)
 *   3. Visit /api/auth/viewer       -> redirects to Twitch OAuth (viewer scopes)
 *   4. Twitch redirects back to /api/auth/twitch/callback with ?code=...&state=...
 *   5. We exchange the code for tokens, create JWT for viewers
 */
import { Router, type RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";
import {
  exchangeCodeForTokens,
  getUser,
  validateToken,
} from "../../services/twitch-api.js";
import {
  loadTokens,
  updateBotTokens,
  updateBroadcasterTokens,
} from "../../services/token-store.js";

const router: Router = Router();

const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/authorize";

// Scopes
const BOT_SCOPES = ["user:read:chat", "user:write:chat", "user:bot"];
const BROADCASTER_SCOPES = ["channel:bot"];
const VIEWER_SCOPES = ["user:read:email"]; // Minimal — we just need identity

// ─── Status endpoint ─────────────────────────────────────────────────────────

router.get("/status", ((_req, res) => {
  const tokens = loadTokens();
  res.json({
    botAuthorized: !!tokens?.botAccessToken,
    botUserId: tokens?.botUserId ?? null,
    botScopes: tokens?.botScopes ?? [],
    botTokenUpdatedAt: tokens?.botTokenUpdatedAt ?? null,
    broadcasterAuthorized: !!tokens?.broadcasterAccessToken,
    broadcasterUserId: tokens?.broadcasterUserId ?? null,
    broadcasterScopes: tokens?.broadcasterScopes ?? [],
    broadcasterTokenUpdatedAt: tokens?.broadcasterTokenUpdatedAt ?? null,
  });
}) as RequestHandler);

// ─── Bot Authorization ──────────────────────────────────────────────────────

router.get("/bot", ((_req, res) => {
  const params = new URLSearchParams({
    client_id: config.TWITCH_CLIENT_ID,
    redirect_uri: config.TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: BOT_SCOPES.join(" "),
    state: "bot",
    force_verify: "true",
  });
  res.redirect(`${TWITCH_AUTH_URL}?${params.toString()}`);
}) as RequestHandler);

// ─── Broadcaster Authorization ──────────────────────────────────────────────

router.get("/broadcaster", ((_req, res) => {
  const params = new URLSearchParams({
    client_id: config.TWITCH_CLIENT_ID,
    redirect_uri: config.TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: BROADCASTER_SCOPES.join(" "),
    state: "broadcaster",
    force_verify: "true",
  });
  res.redirect(`${TWITCH_AUTH_URL}?${params.toString()}`);
}) as RequestHandler);

// ─── Viewer Authorization (for web interface) ───────────────────────────────

router.get("/viewer", ((_req, res) => {
  const params = new URLSearchParams({
    client_id: config.TWITCH_CLIENT_ID,
    redirect_uri: config.TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: VIEWER_SCOPES.join(" "),
    state: "viewer",
  });
  res.redirect(`${TWITCH_AUTH_URL}?${params.toString()}`);
}) as RequestHandler);

// ─── Twitch OAuth Callback ──────────────────────────────────────────────────

router.get("/twitch/callback", (async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    return res.status(400).send(`
      <html><body style="font-family:monospace;padding:2em;background:#1a1a2e;color:#eee">
        <h1 style="color:#e74c3c">Authorization Denied</h1>
        <p>Error: ${error}</p>
        <p>${req.query.error_description ?? ""}</p>
        <a href="/api/auth/status" style="color:#3498db">Back to status</a>
      </body></html>
    `);
  }

  if (!code || !state) {
    return res.status(400).send("Missing code or state parameter.");
  }

  // Exchange code for tokens
  const tokenResult = await exchangeCodeForTokens(code);
  if (!tokenResult) {
    return res.status(500).send(`
      <html><body style="font-family:monospace;padding:2em;background:#1a1a2e;color:#eee">
        <h1 style="color:#e74c3c">Token Exchange Failed</h1>
        <p>Could not exchange authorization code for tokens. Check server logs.</p>
        <a href="/api/auth/status" style="color:#3498db">Back to status</a>
      </body></html>
    `);
  }

  // Get the user info
  const user = await getUser(tokenResult.access_token);
  if (!user) {
    return res.status(500).send(`
      <html><body style="font-family:monospace;padding:2em;background:#1a1a2e;color:#eee">
        <h1 style="color:#e74c3c">User Lookup Failed</h1>
        <p>Got tokens but couldn't fetch user info. Check server logs.</p>
        <a href="/api/auth/status" style="color:#3498db">Back to status</a>
      </body></html>
    `);
  }

  // ─── Bot flow ─────────────────────────────────────────────────────────────
  if (state === "bot") {
    updateBotTokens(
      tokenResult.access_token,
      tokenResult.refresh_token,
      user.id,
      tokenResult.scope
    );
    console.log(
      `Bot authorized: ${user.display_name} (${user.id}) — scopes: ${tokenResult.scope.join(", ")}`
    );
    return res.send(`
      <html><body style="font-family:monospace;padding:2em;background:#1a1a2e;color:#eee">
        <h1 style="color:#2ecc71">Bot Authorized!</h1>
        <table style="margin:1em 0">
          <tr><td style="padding-right:1em;color:#888">Username:</td><td>${user.display_name}</td></tr>
          <tr><td style="padding-right:1em;color:#888">User ID:</td><td>${user.id}</td></tr>
          <tr><td style="padding-right:1em;color:#888">Scopes:</td><td>${tokenResult.scope.join(", ")}</td></tr>
        </table>
        <h2>Next Step</h2>
        <p>Now authorize the <strong>broadcaster</strong> account (log into your streamer account first):</p>
        <a href="/api/auth/broadcaster" style="color:#3498db;font-size:1.2em">Authorize Broadcaster</a>
        <br><br>
        <a href="/api/auth/status" style="color:#888">View auth status</a>
      </body></html>
    `);
  }

  // ─── Broadcaster flow ─────────────────────────────────────────────────────
  if (state === "broadcaster") {
    try {
      updateBroadcasterTokens(
        tokenResult.access_token,
        tokenResult.refresh_token,
        user.id,
        tokenResult.scope
      );
    } catch (err) {
      return res.status(400).send(`
        <html><body style="font-family:monospace;padding:2em;background:#1a1a2e;color:#eee">
          <h1 style="color:#e74c3c">Error</h1>
          <p>${err instanceof Error ? err.message : "Unknown error"}</p>
          <p>Please authorize the bot account first.</p>
          <a href="/api/auth/bot" style="color:#3498db">Authorize Bot</a>
        </body></html>
      `);
    }
    console.log(
      `Broadcaster authorized: ${user.display_name} (${user.id}) — scopes: ${tokenResult.scope.join(", ")}`
    );
    return res.send(`
      <html><body style="font-family:monospace;padding:2em;background:#1a1a2e;color:#eee">
        <h1 style="color:#2ecc71">Broadcaster Authorized!</h1>
        <table style="margin:1em 0">
          <tr><td style="padding-right:1em;color:#888">Username:</td><td>${user.display_name}</td></tr>
          <tr><td style="padding-right:1em;color:#888">User ID:</td><td>${user.id}</td></tr>
          <tr><td style="padding-right:1em;color:#888">Scopes:</td><td>${tokenResult.scope.join(", ")}</td></tr>
        </table>
        <h2>All Set!</h2>
        <p>Both bot and broadcaster are authorized. Restart the server to connect to chat.</p>
        <a href="/api/auth/status" style="color:#888">View auth status</a>
      </body></html>
    `);
  }

  // ─── Viewer flow ──────────────────────────────────────────────────────────
  if (state === "viewer") {
    // Create a JWT for the viewer to use with Socket.IO
    const token = jwt.sign(
      {
        twitchId: user.id,
        username: user.login,
        displayName: user.display_name,
      },
      config.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`Viewer authenticated: ${user.display_name} (${user.id})`);

    // Redirect to client with token in URL fragment (not in query to avoid logging)
    return res.redirect(`${config.CLIENT_URL}/?auth=${token}`);
  }

  res.status(400).send("Unknown state parameter.");
}) as RequestHandler);

// ─── Validate stored tokens ─────────────────────────────────────────────────

router.get("/validate", (async (_req, res) => {
  const tokens = loadTokens();
  if (!tokens) {
    return res.json({ valid: false, message: "No tokens stored." });
  }

  const botValidation = await validateToken(tokens.botAccessToken);
  const broadcasterValidation = tokens.broadcasterAccessToken
    ? await validateToken(tokens.broadcasterAccessToken)
    : null;

  res.json({
    bot: botValidation
      ? {
          valid: true,
          login: botValidation.login,
          expiresIn: botValidation.expires_in,
          scopes: botValidation.scopes,
        }
      : { valid: false, message: "Bot token expired or invalid" },
    broadcaster: tokens.broadcasterAccessToken
      ? broadcasterValidation
        ? {
            valid: true,
            login: broadcasterValidation.login,
            expiresIn: broadcasterValidation.expires_in,
            scopes: broadcasterValidation.scopes,
          }
        : { valid: false, message: "Broadcaster token expired or invalid" }
      : { valid: false, message: "Not yet authorized" },
  });
}) as RequestHandler);

// ─── Verify JWT (for client-side validation) ────────────────────────────────

router.get("/me", ((req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(
      authHeader.slice(7),
      config.JWT_SECRET
    ) as { twitchId: string; username: string; displayName: string };
    res.json(decoded);
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}) as RequestHandler);

export default router;
