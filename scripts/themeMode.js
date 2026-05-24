import { STORAGE_KEYS } from "./constants.js";

export function initializeTheme(toggleButton) {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const nextTheme = savedTheme || (prefersDark ? "dark" : "light");
  applyTheme(nextTheme, toggleButton);
}

export function toggleTheme(toggleButton) {
  const currentTheme = document.documentElement.getAttribute("data-bs-theme") || "light";
  const nextTheme = currentTheme === "light" ? "dark" : "light";
  applyTheme(nextTheme, toggleButton);
}

function applyTheme(theme, toggleButton) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-bs-theme", normalized);
  localStorage.setItem(STORAGE_KEYS.theme, normalized);

  if (toggleButton) {
    toggleButton.textContent = normalized === "dark" ? "Light mode" : "Dark mode";
  }
}
