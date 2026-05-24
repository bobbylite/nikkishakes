import { DEFAULT_FLAVOR, FLAVORS, STORAGE_KEYS } from "./constants.js";

export { DEFAULT_FLAVOR, FLAVORS };

const KEY = STORAGE_KEYS.milkshakes;

const seedShakes = [
  {
    id: crypto.randomUUID(),
    name: "Vanilla Cloud",
    shop: "Soda & Co",
    flavor: "Vanilla",
    rating: 9.4,
    photo:
      "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=80",
    notes: "Classic vanilla bean flavor and perfect texture.",
    createdAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    name: "Midnight Cocoa",
    shop: "Churn Club",
    flavor: "Chocolate",
    rating: 8.8,
    photo:
      "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=80",
    notes: "Deep cocoa profile with soft whipped cream.",
    createdAt: new Date().toISOString()
  }
];

export function getShakes() {
  const parsed = safeReadArray(KEY);
  if (!parsed) {
    saveShakes(seedShakes);
    return [...seedShakes];
  }

  return parsed.map(normalizeShake).filter(Boolean);
}

export function saveShakes(shakes) {
  localStorage.setItem(KEY, JSON.stringify(shakes));
}

export function addShake(shake) {
  const shakes = getShakes();
  const payload = normalizeShake({
    ...shake,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  });

  if (!payload) {
    throw new Error("Invalid shake payload");
  }

  shakes.push(payload);
  saveShakes(shakes);
  return payload;
}

export function updateShake(id, updates) {
  const shakes = getShakes();
  const next = shakes.map((shake) => {
    if (shake.id !== id) {
      return shake;
    }
    return normalizeShake({
      ...shake,
      ...updates
    });
  });

  saveShakes(next.filter(Boolean));
}

export function deleteShake(id) {
  const shakes = getShakes();
  const next = shakes.filter((shake) => shake.id !== id);
  saveShakes(next);
}

export function groupByFlavor(shakes) {
  return shakes.reduce((acc, shake) => {
    const flavor = shake.flavor || DEFAULT_FLAVOR;
    if (!acc[flavor]) {
      acc[flavor] = [];
    }
    acc[flavor].push(shake);
    return acc;
  }, {});
}

export function sortByRatingDesc(shakes) {
  return [...shakes].sort((a, b) => Number(b.rating) - Number(a.rating));
}

function safeReadArray(key) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeShake(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rating = Number(value.rating);
  const normalizedRating = Number.isFinite(rating) ? Math.max(1, Math.min(10, rating)) : 1;

  return {
    id: String(value.id || crypto.randomUUID()),
    name: String(value.name || "Untitled Shake").trim() || "Untitled Shake",
    shop: String(value.shop || "Unknown Shop").trim() || "Unknown Shop",
    flavor: FLAVORS.includes(value.flavor) ? value.flavor : DEFAULT_FLAVOR,
    rating: Number(normalizedRating.toFixed(1)),
    photo: String(value.photo || "").trim(),
    notes: String(value.notes || "").trim(),
    createdAt: String(value.createdAt || new Date().toISOString())
  };
}
