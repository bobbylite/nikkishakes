import { STORAGE_KEYS } from "./constants.js";
import { pingOneConfig } from "./pingoneConfig.js";
import { upsertUser } from "./users.js";
import {
  OAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const DEFAULT_SCOPES = "openid profile email shakes";
const DEFAULT_PROVIDER_ID = "oidc.pingone";
const REQUIRED_ADMIN_GROUP = pingOneConfig.requiredAdminGroup || "shakesAdmin";
const REQUIRED_RANKER_GROUP = "shakesRanker";
const DEFAULT_LOGIN_MODE = "auto";

export function isAuthenticated() {
  return Boolean(window.firebaseAuth?.currentUser);
}

export function hasAdminAccess() {
  const session = readSession();
  return Boolean(
    window.firebaseAuth?.currentUser &&
      session?.active !== false &&
      Array.isArray(session?.groups) &&
      session.groups.includes(REQUIRED_ADMIN_GROUP)
  );
}

export function hasRankerAccess() {
  const session = readSession();
  return Boolean(
    window.firebaseAuth?.currentUser &&
      session?.active !== false &&
      Array.isArray(session?.groups) &&
      session.groups.includes(REQUIRED_RANKER_GROUP)
  );
}

export async function ensureAuthorizationState() {
  if (window.firebaseAuthReady) {
    await window.firebaseAuthReady;
  }

  const auth = window.firebaseAuth;
  const user = auth?.currentUser;

  if (!user) {
    clearSession();
    return { ok: false, authorized: false, error: "not-authenticated" };
  }

  const existing = readSession();
  let groups = Array.isArray(existing?.groups) ? existing.groups : [];

  try {
    const idTokenResult = await user.getIdTokenResult();
    if (Array.isArray(idTokenResult?.claims?.groups) && idTokenResult.claims.groups.length) {
      groups = idTokenResult.claims.groups;
    }
  } catch {
    // Keep previously known groups if token claims are unavailable.
  }

  saveSession({
    uid: user.uid,
    active: true,
    groups,
    signedInAt: existing?.signedInAt || Date.now(),
    accessToken: existing?.accessToken || "",
    expiresAt: Number(existing?.expiresAt || 0)
  });

  return { ok: true, authorized: groups.includes(REQUIRED_ADMIN_GROUP) };
}

export async function beginLogin() {
  if (!pingOneConfig.enabled) {
    return { ok: false, error: "pingone-disabled" };
  }

  if (!window.firebaseAuth) {
    return { ok: false, error: "firebase-auth-not-ready" };
  }

  const loginMode = resolveLoginMode(pingOneConfig.loginMode);

  if (loginMode === "redirect") {
    return startPkceRedirect();
  }

  // Popup (or auto with popup-first)
  const provider = new OAuthProvider(pingOneConfig.firebaseProviderId || DEFAULT_PROVIDER_ID);
  String(pingOneConfig.scopes || DEFAULT_SCOPES)
    .split(/\s+/).map((s) => s.trim()).filter(Boolean)
    .forEach((scope) => provider.addScope(scope));

  if (sessionStorage.getItem(STORAGE_KEYS.forceLogin)) {
    provider.setCustomParameters({ prompt: "login" });
    sessionStorage.removeItem(STORAGE_KEYS.forceLogin);
  }

  try {
    const result = await signInWithPopup(window.firebaseAuth, provider);
    const session = buildSessionFromCredentialResult(result);
    saveSession(session);
    const { pingOneUserId, email, displayName } = extractPingOneProfile(result);
    void upsertUser(result.user, pingOneUserId, email, displayName);
    return { ok: true, authorized: session.groups.includes(REQUIRED_ADMIN_GROUP) };
  } catch (err) {
    if (loginMode === "popup") {
      return { ok: false, error: mapAuthError(err) };
    }

    const code = String(err?.code || "").toLowerCase();
    const isBlocked = code.includes("popup-blocked") || code.includes("operation-not-supported");
    if (!isBlocked) {
      return { ok: false, error: mapAuthError(err) };
    }

    return startPkceRedirect();
  }
}

// ---------------------------------------------------------------------------
// PKCE redirect — redirects directly to PingOne, no Firebase auth handler
// ---------------------------------------------------------------------------

async function startPkceRedirect() {
  const { verifier, challenge } = await generatePkce();
  const state = generateRandomBase64(16);
  sessionStorage.setItem(STORAGE_KEYS.oauthContext, JSON.stringify({ verifier, state }));

  const url = new URL(`${pingOneConfig.issuerBaseUrl}/authorize`);
  url.searchParams.set("client_id", pingOneConfig.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", pingOneConfig.scopes || DEFAULT_SCOPES);
  url.searchParams.set("redirect_uri", pingOneConfig.redirectUri);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  if (sessionStorage.getItem(STORAGE_KEYS.forceLogin)) {
    url.searchParams.set("prompt", "login");
    sessionStorage.removeItem(STORAGE_KEYS.forceLogin);
  }

  window.location.href = url.toString();
  return { ok: true };
}

async function generatePkce() {
  const verifier = generateRandomBase64(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { verifier, challenge };
}

function generateRandomBase64(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function resolveLoginMode(value) {
  const mode = String(value || DEFAULT_LOGIN_MODE).toLowerCase();
  if (mode === "popup" || mode === "redirect") return mode;
  return "auto";
}

// ---------------------------------------------------------------------------
// Callback handling — called on every page load to detect a PKCE return
// ---------------------------------------------------------------------------

export async function handleAuthCallbackIfPresent() {
  if (window.firebaseAuthReady) {
    await window.firebaseAuthReady;
  }

  const auth = window.firebaseAuth;
  if (!auth) {
    return { handled: false };
  }

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const errorParam = params.get("error");

  // No PKCE callback — check existing auth state and return
  if (!code && !errorParam) {
    if (auth.currentUser) {
      const authorization = await ensureAuthorizationState();
      return { handled: false, ok: authorization.ok, authorized: authorization.authorized };
    }
    return { handled: false };
  }

  // Strip the OAuth params from the URL immediately
  cleanupCallbackQuery();

  // PingOne returned an error (e.g. user cancelled, access denied)
  if (errorParam) {
    sessionStorage.removeItem(STORAGE_KEYS.oauthContext);
    return { handled: true, ok: false, error: errorParam };
  }

  // Validate PKCE state to prevent CSRF
  let ctx = null;
  try {
    ctx = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.oauthContext) || "null");
  } catch {
    // malformed — treat as missing
  }
  sessionStorage.removeItem(STORAGE_KEYS.oauthContext);

  if (!ctx?.verifier || ctx.state !== state) {
    return { handled: true, ok: false, error: "auth-state-mismatch" };
  }

  try {
    // 1. Exchange authorization code for PingOne tokens via PKCE (no client secret needed)
    const tokenResp = await fetch(`${pingOneConfig.issuerBaseUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: pingOneConfig.clientId,
        code,
        redirect_uri: pingOneConfig.redirectUri,
        code_verifier: ctx.verifier,
      }).toString(),
    });

    if (!tokenResp.ok) {
      const errBody = await tokenResp.json().catch(() => ({}));
      return { handled: true, ok: false, error: errBody.error || "token-exchange-failed" };
    }

    const { id_token: idToken, access_token: accessToken } = await tokenResp.json();

    // 2. Sign into Firebase using the PingOne ID token
    //    Internally calls identitytoolkit.googleapis.com/v1/accounts:signInWithIdp
    const provider = new OAuthProvider(pingOneConfig.firebaseProviderId || DEFAULT_PROVIDER_ID);
    const credential = provider.credential({ idToken });
    const result = await signInWithCredential(auth, credential);

    // 3. Build session from PingOne tokens (groups come from access token JWT)
    const session = buildSessionFromTokens(result.user, idToken, accessToken);
    saveSession(session);

    const { pingOneUserId, email, displayName } = extractPingOneProfile(result);
    void upsertUser(result.user, pingOneUserId, email, displayName);

    return {
      handled: true,
      ok: true,
      authorized: session.groups.includes(REQUIRED_ADMIN_GROUP),
    };
  } catch (err) {
    clearSession();
    return { handled: true, ok: false, error: mapAuthError(err) };
  }
}

export function logout() {
  clearSession();
  sessionStorage.removeItem(STORAGE_KEYS.oauthContext);
  sessionStorage.setItem(STORAGE_KEYS.forceLogin, "1");

  if (window.firebaseAuth) {
    void signOut(window.firebaseAuth);
  }
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

function buildSessionFromCredentialResult(result) {
  const credential = OAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken || "";
  const idToken = credential?.idToken || "";
  return buildSessionFromTokens(result.user, idToken, accessToken);
}

function buildSessionFromTokens(user, idToken, accessToken) {
  const parsed = parseJwtPayload(accessToken);
  const groups = Array.isArray(parsed?.groups) ? parsed.groups : [];
  const expMs = Number(parsed?.exp || 0) > 0 ? Number(parsed.exp) * 1000 : 0;
  return {
    uid: user.uid,
    active: true,
    groups,
    signedInAt: Date.now(),
    accessToken,
    idToken,
    expiresAt: expMs,
  };
}

function extractPingOneProfile(result) {
  const providerData = result.user.providerData.find(
    (p) => p.providerId === DEFAULT_PROVIDER_ID
  );
  return {
    pingOneUserId: providerData?.uid || "",
    email: result.user.email || providerData?.email || "",
    displayName: result.user.displayName || providerData?.displayName || "",
  };
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEYS.authSession) || "null");
  } catch {
    return null;
  }
}

function saveSession(nextSession) {
  sessionStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify(nextSession));
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEYS.authSession);
}

function cleanupCallbackQuery() {
  if (!window.location.search) {
    return;
  }
  const url = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, document.title, url);
}

function mapAuthError(err) {
  const code = String(err?.code || "").toLowerCase();
  if (code.includes("popup") || code.includes("cancel")) return "login-cancelled";
  if (code.includes("network")) return "auth-network";
  return code || "auth-failed";
}

function parseJwtPayload(token) {
  if (!token || token.split(".").length < 2) {
    return null;
  }
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
