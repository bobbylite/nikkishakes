export const STORAGE_NAMESPACE = "nikkishakes";

export const STORAGE_KEYS = Object.freeze({
  theme: `${STORAGE_NAMESPACE}:theme`,
  authSession: `${STORAGE_NAMESPACE}:auth-session`,
  oauthContext: `${STORAGE_NAMESPACE}:oauth-context`,
  authRedirectPending: `${STORAGE_NAMESPACE}:auth-redirect-pending`,
  milkshakes: `${STORAGE_NAMESPACE}:milkshakes`,
  forceLogin: `${STORAGE_NAMESPACE}:force-login`
});

export const ROUTES = Object.freeze({
  rankings: "rankings",
  login: "login",
  admin: "admin"
});

export const VALID_ROUTES = new Set(Object.values(ROUTES));

export const DEFAULT_FLAVOR = "Vanilla";

export const FLAVORS = Object.freeze([
  "Vanilla",
  "Chocolate",
  "Strawberry",
  "Coffee",
  "Caramel",
  "Cookies & Cream",
  "Mint",
  "Seasonal"
]);
