export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function byId(id) {
  return document.getElementById(id);
}

export function clearChildren(node) {
  node.innerHTML = "";
}

export function setStatusMessage(node, message, isError = false) {
  node.textContent = message;
  node.classList.toggle("error", isError);
}
