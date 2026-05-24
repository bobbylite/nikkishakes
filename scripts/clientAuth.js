import { STORAGE_KEYS } from "./constants.js";
import { pingOneConfig } from "./pingoneConfig.js";

export function isAuthenticated() {
  const session = readSession();
  if (
    !session ||
    !session.accessToken ||
    Number(session.expiresAt) <= Date.now() ||
    session.active === false
  ) {
    clearSession();
    return false;
  }

  return true;
}

export function hasAdminAccess() {
  const session = readSession();
  return Boolean(
    session &&
      session.accessToken &&
      Number(session.expiresAt) > Date.now() &&
      session.active !== false &&
      Array.isArray(session.groups) &&
      session.groups.includes("shakesAdmin")
  );
}

export async function ensureAuthorizationState() {
  const session = readSession();
  if (
    !session ||
    !session.accessToken ||
    Number(session.expiresAt) <= Date.now() ||
    session.active === false
  ) {
    clearSession();
    return { ok: false, authorized: false };
  }

  if (Array.isArray(session.groups) && typeof session.active === "boolean") {
    if (!session.active) {
      clearSession();
      return { ok: false, authorized: false };
    }
    return { ok: true, authorized: session.active && session.groups.includes("shakesAdmin") };
  }

  const result = await introspectAccessToken(session.accessToken);
  if (!result.ok) {
    clearSession();
    return { ok: false, authorized: false, error: result.error };
  }

  saveSession({
    ...session,
    active: result.active,
    groups: result.groups,
    claims: result.claims,
    introspectedAt: Date.now()
  });

  if (!result.active) {
    clearSession();
    return { ok: false, authorized: false };
  }

  return { ok: true, authorized: result.active && result.groups.includes("shakesAdmin") };
}

export async function beginLogin() {
  const resolved = resolveOauthConfig();
  if (!resolved.enabled) {
    return { ok: false, error: "PingOne is not configured in scripts/pingoneConfig.js." };
  }

  const state = randomUrlSafe(24);
  const verifier = randomUrlSafe(64);
  const challenge = await toCodeChallenge(verifier);

  sessionStorage.setItem(
    STORAGE_KEYS.oauthContext,
    JSON.stringify({
      state,
      verifier,
      createdAt: Date.now()
    })
  );

  const params = new URLSearchParams({
    client_id: resolved.clientId,
    response_type: "code",
    redirect_uri: resolved.redirectUri,
    scope: resolved.scopes,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  window.location.assign(`${resolved.authorizeUrl}?${params.toString()}`);
  return { ok: true };
}

export async function handleAuthCallbackIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  if (!code && !state && !error) {
    return { handled: false };
  }

  const resolved = resolveOauthConfig();
  if (!resolved.enabled) {
    clearOAuthContext();
    cleanupCallbackQuery();
    return { handled: true, ok: false, error: "PingOne config is disabled." };
  }

  if (error) {
    clearOAuthContext();
    cleanupCallbackQuery();
    return { handled: true, ok: false, error };
  }

  const oauthContext = readOAuthContext();
  if (!code || !state || !oauthContext || oauthContext.state !== state) {
    clearOAuthContext();
    cleanupCallbackQuery();
    return { handled: true, ok: false, error: "invalid-callback-state" };
  }

  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: resolved.redirectUri,
      code_verifier: oauthContext.verifier,
      client_id: resolved.clientId
    });

    const response = await fetch(resolved.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: tokenBody.toString()
    });

    const raw = await response.text();
    const parsed = parseJsonSafe(raw);

    if (!response.ok) {
      clearOAuthContext();
      cleanupCallbackQuery();
      return {
        handled: true,
        ok: false,
        error: parsed?.error || `token-${response.status}`,
        reason: parsed?.error_description || "token_exchange_failed"
      };
    }

    const expiresAt = Date.now() + Number(parsed?.expires_in || 3600) * 1000;
    saveSession({
      accessToken: parsed?.access_token,
      idToken: parsed?.id_token || "",
      refreshToken: parsed?.refresh_token || "",
      expiresAt
    });

    const introspection = await introspectAccessToken(parsed?.access_token);
    if (!introspection.ok) {
      clearSession();
      clearOAuthContext();
      cleanupCallbackQuery();
      return {
        handled: true,
        ok: false,
        error: introspection.error || "introspection-failed"
      };
    }

    saveSession({
      accessToken: parsed?.access_token,
      idToken: parsed?.id_token || "",
      refreshToken: parsed?.refresh_token || "",
      expiresAt,
      active: introspection.active,
      groups: introspection.groups,
      claims: introspection.claims,
      introspectedAt: Date.now()
    });

    clearOAuthContext();
    cleanupCallbackQuery();
    return {
      handled: true,
      ok: true,
      authorized: introspection.active && introspection.groups.includes("shakesAdmin")
    };
  } catch {
    clearOAuthContext();
    cleanupCallbackQuery();
    return { handled: true, ok: false, error: "token-network" };
  }
}

export function logout() {
  const resolved = resolveOauthConfig();
  const session = readSession();
  clearSession();

  if (resolved.endSessionUrl) {
    const params = new URLSearchParams();
    if (session?.idToken) {
      params.set("id_token_hint", session.idToken);
    }
    if (resolved.postLogoutRedirectUri) {
      params.set("post_logout_redirect_uri", resolved.postLogoutRedirectUri);
    }
    if (resolved.clientId) {
      params.set("client_id", resolved.clientId);
    }

    const query = params.toString();
    window.location.assign(query ? `${resolved.endSessionUrl}?${query}` : resolved.endSessionUrl);
    return;
  }

  window.location.hash = "#/login?loggedOut=1";
}

function resolveOauthConfig() {
  const issuerBase = String(pingOneConfig.issuerBaseUrl || "").replace(/\/+$/, "");

  const authorizeUrl =
    pingOneConfig.authorizeEndpoint || (issuerBase ? `${issuerBase}/authorize` : "");
  const tokenUrl = pingOneConfig.tokenEndpoint || (issuerBase ? `${issuerBase}/access_token` : "");
  const introspectionUrl =
    pingOneConfig.introspectionEndpoint ||
    (issuerBase ? `${issuerBase}/introspect` : tokenUrl.replace(/\/token$/, "/introspect"));

  const endSessionUrl =
    pingOneConfig.endSessionEndpoint ||
    (issuerBase && issuerBase.endsWith("/as") ? `${issuerBase}/signoff` : "");

  const enabled = Boolean(
    pingOneConfig.enabled &&
      pingOneConfig.clientId &&
      pingOneConfig.redirectUri &&
      authorizeUrl &&
      tokenUrl
  );

  return {
    enabled,
    clientId: pingOneConfig.clientId,
    redirectUri: pingOneConfig.redirectUri,
    postLogoutRedirectUri: pingOneConfig.postLogoutRedirectUri,
    scopes: pingOneConfig.scopes || "openid profile email",
    authorizeUrl,
    tokenUrl,
    introspectionUrl,
    endSessionUrl
  };
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEYS.authSession) || "null");
  } catch {
    return null;
  }
}

function readOAuthContext() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.oauthContext) || "null");
    if (!parsed || !parsed.state || !parsed.verifier) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEYS.authSession);
  clearOAuthContext();
}

function saveSession(nextSession) {
  sessionStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify(nextSession));
}

function clearOAuthContext() {
  sessionStorage.removeItem(STORAGE_KEYS.oauthContext);
}

function cleanupCallbackQuery() {
  const url = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, document.title, url);
}

function parseJsonSafe(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function introspectAccessToken(accessToken) {
  const resolved = resolveOauthConfig();
  if (!resolved.enabled || !resolved.introspectionUrl || !accessToken) {
    return { ok: false, error: "introspection-unavailable" };
  }

  try {
    const body = new URLSearchParams({
      token: accessToken,
      client_id: resolved.clientId,
      token_type_hint: "access_token"
    });

    const response = await fetch(resolved.introspectionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });

    const raw = await response.text();
    const parsed = parseJsonSafe(raw);

    if (!response.ok) {
      return {
        ok: false,
        error: parsed?.error || `introspection-${response.status}`
      };
    }

    const groups = Array.isArray(parsed?.groups) ? parsed.groups : [];

    return {
      ok: true,
      active: Boolean(parsed?.active),
      groups,
      claims: parsed || {}
    };
  } catch {
    return { ok: false, error: "introspection-network" };
  }
}

function randomUrlSafe(byteCount) {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function toCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
