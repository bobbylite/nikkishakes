import { STORAGE_KEYS } from "./constants.js";
import { pingOneConfig } from "./pingoneConfig.js";
import { upsertUser } from "./users.js";
import {
  OAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const DEFAULT_SCOPES = "openid profile email shakes";
const DEFAULT_PROVIDER_ID = "oidc.pingone";
const REQUIRED_ADMIN_GROUP = pingOneConfig.requiredAdminGroup || "shakesAdmin";
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
    const idToken = await user.getIdTokenResult();
    if (Array.isArray(idToken?.claims?.groups) && idToken.claims.groups.length) {
      groups = idToken.claims.groups;
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

  const auth = window.firebaseAuth;
  if (!auth) {
    return { ok: false, error: "firebase-auth-not-ready" };
  }

  const provider = new OAuthProvider(pingOneConfig.firebaseProviderId || DEFAULT_PROVIDER_ID);
  const scopes = String(pingOneConfig.scopes || DEFAULT_SCOPES)
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  scopes.forEach((scope) => provider.addScope(scope));

  const loginMode = resolveLoginMode(pingOneConfig.loginMode);

  if (loginMode === "redirect") {
    return startRedirectSignIn(auth, provider);
  }

  try {
    const popupResult = await signInWithPopup(auth, provider);
    const session = buildSessionFromCredentialResult(popupResult);
    saveSession(session);
    sessionStorage.removeItem(STORAGE_KEYS.authRedirectPending);
    const { pingOneUserId, email, displayName } = extractPingOneProfile(popupResult);
    void upsertUser(popupResult.user, pingOneUserId, email, displayName);
    return {
      ok: true,
      authorized: session.groups.includes(REQUIRED_ADMIN_GROUP)
    };
  } catch (err) {
    if (loginMode === "popup") {
      return { ok: false, error: mapAuthError(err) };
    }

    const code = String(err?.code || "").toLowerCase();
    const shouldFallbackToRedirect =
      code.includes("popup-blocked") || code.includes("operation-not-supported");

    if (!shouldFallbackToRedirect) {
      return { ok: false, error: mapAuthError(err) };
    }

    return startRedirectSignIn(auth, provider);
  }
}

async function startRedirectSignIn(auth, provider) {
  try {
    sessionStorage.setItem(STORAGE_KEYS.authRedirectPending, String(Date.now()));
    await signInWithRedirect(auth, provider);
    return { ok: true };
  } catch (err) {
    sessionStorage.removeItem(STORAGE_KEYS.authRedirectPending);
    return { ok: false, error: mapAuthError(err) };
  }
}

function resolveLoginMode(value) {
  const mode = String(value || DEFAULT_LOGIN_MODE).toLowerCase();
  if (mode === "popup" || mode === "redirect") {
    return mode;
  }
  return "auto";
}

function buildSessionFromCredentialResult(result) {
  const credential = OAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken || "";
  const parsed = parseJwtPayload(accessToken);
  const groups = Array.isArray(parsed?.groups) ? parsed.groups : [];
  const expMs = Number(parsed?.exp || 0) > 0 ? Number(parsed.exp) * 1000 : 0;

  return {
    uid: result.user.uid,
    active: true,
    groups,
    signedInAt: Date.now(),
    accessToken,
    expiresAt: expMs
  };
}

function extractPingOneProfile(result) {
  const pingOneProviderData = result.user.providerData
    .find(p => p.providerId === DEFAULT_PROVIDER_ID);

  return {
    pingOneUserId: pingOneProviderData?.uid || "",
    email: result.user.email || pingOneProviderData?.email || "",
    displayName: result.user.displayName || pingOneProviderData?.displayName || ""
  };
}

export async function handleAuthCallbackIfPresent() {
  if (window.firebaseAuthReady) {
    await window.firebaseAuthReady;
  }

  const auth = window.firebaseAuth;
  if (!auth) {
    return { handled: false };
  }

  const params = new URLSearchParams(window.location.search);
  const hasOAuthParams = params.has("code") || params.has("state") || params.has("error");
  const hadPendingRedirect = Boolean(sessionStorage.getItem(STORAGE_KEYS.authRedirectPending));

  try {
    const result = await getRedirectResult(auth);
    if (result) {
      const session = buildSessionFromCredentialResult(result);
      saveSession(session);

      sessionStorage.removeItem(STORAGE_KEYS.authRedirectPending);
      cleanupCallbackQuery();

      const { pingOneUserId, email, displayName } = extractPingOneProfile(result);
      void upsertUser(result.user, pingOneUserId, email, displayName);

      return {
        handled: true,
        ok: true,
        authorized: session.groups.includes(REQUIRED_ADMIN_GROUP)
      };
    }

    if (auth.currentUser) {
      const authorization = await ensureAuthorizationState();
      sessionStorage.removeItem(STORAGE_KEYS.authRedirectPending);
      if (hasOAuthParams) {
        cleanupCallbackQuery();
      }
      return {
        handled: hasOAuthParams,
        ok: authorization.ok,
        authorized: authorization.authorized,
        error: authorization.error
      };
    }

    if (hasOAuthParams) {
      cleanupCallbackQuery();
      return {
        handled: true,
        ok: false,
        error: "firebase-oidc-handler-misconfigured"
      };
    }

    if (hadPendingRedirect) {
      sessionStorage.removeItem(STORAGE_KEYS.authRedirectPending);
      return {
        handled: true,
        ok: false,
        error: "firebase-oidc-callback-not-completed"
      };
    }

    return { handled: false };
  } catch (err) {
    clearSession();
    sessionStorage.removeItem(STORAGE_KEYS.authRedirectPending);
    if (hasOAuthParams) {
      cleanupCallbackQuery();
    }
    return { handled: true, ok: false, error: mapAuthError(err) };
  }
}

export function logout() {
  clearSession();
  sessionStorage.removeItem(STORAGE_KEYS.authRedirectPending);
  if (window.firebaseAuth) {
    void signOut(window.firebaseAuth);
  }
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
  if (code.includes("popup") || code.includes("cancel")) {
    return "login-cancelled";
  }
  if (code.includes("network")) {
    return "auth-network";
  }
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
