import { ROUTES, VALID_ROUTES } from "./constants.js";

export function parseRouteFromHash(rawHash) {
  const route = (rawHash || `#/${ROUTES.rankings}`)
    .replace(/^#\/?/, "")
    .split("?")[0]
    .trim();

  return VALID_ROUTES.has(route) ? route : ROUTES.rankings;
}

export function parseQueryFromHash(rawHash) {
  const hash = rawHash || `#/${ROUTES.rankings}`;
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

export function navigateTo(route, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const serialized = params.toString();
  window.location.hash = serialized ? `#/${route}?${serialized}` : `#/${route}`;
}
