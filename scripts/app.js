import { DEFAULT_FLAVOR, FLAVORS, ROUTES, STORAGE_KEYS } from "./constants.js";
import {
  beginLogin,
  ensureAuthorizationState,
  handleAuthCallbackIfPresent,
  hasAdminAccess,
  hasRankerAccess,
  isAuthenticated,
  logout
} from "./clientAuth.js";
import { byId, clearChildren, escapeHtml, setStatusMessage } from "./domUtils.js";
import { parseQueryFromHash, parseRouteFromHash, navigateTo } from "./routing.js";
import { initializeTheme, toggleTheme } from "./themeMode.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  addShake,
  deleteShake,
  getShakes,
  groupByFlavor,
  sortByRatingDesc,
  updateShake,
  initializeFirestore,
  onDataChange
} from "./data.js";

const FALLBACK_PHOTO_URL =
  "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=900&q=80";

const ui = {
  routeNav: byId("routeNav"),
  themeToggle: byId("themeToggle"),

  views: {
    [ROUTES.rankings]: byId("view-rankings"),
    [ROUTES.login]: byId("view-login"),
    [ROUTES.admin]: byId("view-admin")
  },

  rankings: {
    flavorSelect: byId("flavorSelect"),
    boardTitle: byId("boardTitle"),
    boardMeta: byId("boardMeta"),
    statsRow: byId("statsRow"),
    rankingGrid: byId("rankingGrid")
  },

  login: {
    loginButton: byId("loginBtn"),
    authMessage: byId("authMessage")
  },

  admin: {
    form: byId("milkshakeForm"),
    flavorInput: byId("flavorInput"),
    formMessage: byId("formMessage"),
    adminList: byId("adminList"),
    logoutButton: byId("logoutBtn")
  }
};

const state = {
  selectedFlavor: DEFAULT_FLAVOR,
  authenticated: false,
  adminAuthorized: false,
  rankerAuthorized: false
};

const ACCESS_REQUEST_MESSAGE =
  "Your account is signed in, but admin access is limited to shakesAdmin members. Please request access from the owner or an existing admin.";

void initialize();

async function initialize() {
  initializeTheme(ui.themeToggle);
  initializeFlavorSelects();
  await processAuthCallback();
  await initializeFirestore();
  bindEventHandlers();
  bindAuthSync();
  setupRealtimeSync();
  await renderFromRoute();
}

function bindAuthSync() {
  if (!window.firebaseAuth) {
    return;
  }

  onAuthStateChanged(window.firebaseAuth, () => {
    void renderFromRoute();
  });
}

function setupRealtimeSync() {
  onDataChange(() => {
    const route = parseRouteFromHash(window.location.hash);
    if (route === ROUTES.rankings) {
      renderRankings();
    } else if (route === ROUTES.admin) {
      renderAdmin();
    }
  });
}

function bindEventHandlers() {
  ui.themeToggle?.addEventListener("click", () => {
    toggleTheme(ui.themeToggle);
  });

  ui.routeNav?.addEventListener("click", onNavInteraction);

  ui.rankings.flavorSelect?.addEventListener("change", () => {
    state.selectedFlavor = ui.rankings.flavorSelect.value;
    renderRankings();
  });

  ui.login.loginButton?.addEventListener("click", onLoginSubmit);

  ui.admin.form?.addEventListener("submit", onAdminFormSubmit);
  ui.admin.adminList?.addEventListener("click", onAdminListClick);
  ui.admin.adminList?.addEventListener("change", onAdminListChange);
  ui.admin.logoutButton?.addEventListener("click", () => {
    logout();
    navigateTo(ROUTES.login, { loggedOut: 1 });
  });

  window.addEventListener("hashchange", () => {
    void renderFromRoute();
  });
}

function initializeFlavorSelects() {
  if (!ui.rankings.flavorSelect || !ui.admin.flavorInput) {
    return;
  }

  ui.rankings.flavorSelect.innerHTML = "";
  ui.admin.flavorInput.innerHTML = "";

  for (const flavor of FLAVORS) {
    const rankingOption = document.createElement("option");
    rankingOption.value = flavor;
    rankingOption.textContent = flavor;
    ui.rankings.flavorSelect.append(rankingOption);

    const adminOption = document.createElement("option");
    adminOption.value = flavor;
    adminOption.textContent = flavor;
    ui.admin.flavorInput.append(adminOption);
  }

  ui.rankings.flavorSelect.value = state.selectedFlavor;
  ui.admin.flavorInput.value = DEFAULT_FLAVOR;
}

async function renderFromRoute() {
  state.authenticated = isAuthenticated();

  const route = parseRouteFromHash(window.location.hash);
  const query = parseQueryFromHash(window.location.hash);

  if (route === ROUTES.admin && !state.authenticated) {
    if (window.firebaseAuthReady) {
      await window.firebaseAuthReady;
      state.authenticated = isAuthenticated();
    }

    if (state.authenticated) {
      const authorization = await ensureAuthorizationState();
      state.adminAuthorized = authorization.ok ? authorization.authorized : false;
      state.rankerAuthorized = !state.adminAuthorized && hasRankerAccess();
      if (!authorization.ok && !isAuthenticated()) {
        navigateTo(ROUTES.login, { error: authorization.error || "auth-expired" });
        return;
      }
      updateNavState(route);
      showView(route);
      renderAdmin();
      return;
    }

    navigateTo(ROUTES.login);
    return;
  }

  if (route === ROUTES.admin && state.authenticated) {
    const authorization = await ensureAuthorizationState();
    state.adminAuthorized = authorization.ok ? authorization.authorized : false;
    state.rankerAuthorized = !state.adminAuthorized && hasRankerAccess();

    if (!authorization.ok && !isAuthenticated()) {
      navigateTo(ROUTES.login, { error: authorization.error || "auth-expired" });
      return;
    }
  } else {
    state.adminAuthorized = hasAdminAccess();
    state.rankerAuthorized = !state.adminAuthorized && hasRankerAccess();
  }

  updateNavState(route);
  showView(route);

  if (route === ROUTES.rankings) {
    renderRankings();
    return;
  }

  if (route === ROUTES.login) {
    renderLogin(query);
    return;
  }

  renderAdmin();
}

function onNavInteraction(event) {
  const routeLink = event.target.closest("a[data-route-link]");
  if (!routeLink) {
    return;
  }

  const collapseNode = byId("mainNav");
  if (collapseNode && collapseNode.classList.contains("show") && window.bootstrap?.Collapse) {
    window.bootstrap.Collapse.getOrCreateInstance(collapseNode).hide();
  }
}

function updateNavState(route) {
  document.querySelectorAll("[data-route-link]").forEach((linkNode) => {
    const isActive = linkNode.getAttribute("data-route-link") === route;
    linkNode.classList.toggle("active", isActive);
    linkNode.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

function showView(route) {
  for (const [viewName, viewNode] of Object.entries(ui.views)) {
    const shouldShow = viewName === route;
    viewNode.classList.toggle("d-none", !shouldShow);

    if (shouldShow) {
      viewNode.classList.remove("view-enter");
      void viewNode.offsetWidth;
      viewNode.classList.add("view-enter");
    }
  }
}

function renderLogin(query) {
  const { authMessage } = ui.login;
  if (!authMessage) {
    return;
  }

  setStatusMessage(authMessage, "");

  if (state.authenticated) {
    navigateTo(ROUTES.admin);
    return;
  }

  if (query.get("loggedOut") === "1") {
    setStatusMessage(authMessage, "You are logged out.");
    return;
  }

  const error = query.get("error");
  if (error) {
    setStatusMessage(authMessage, `Login error: ${error}`, true);
  }
}

function onLoginSubmit() {
  const { authMessage } = ui.login;
  if (authMessage) {
    setStatusMessage(authMessage, "Redirecting to PingOne...");
  }

  void beginLogin().then((result) => {
    if (result.ok || !authMessage) {
      return;
    }
    setStatusMessage(authMessage, result.error || "Login unavailable.", true);
  });
}

async function processAuthCallback() {
  const result = await handleAuthCallbackIfPresent();
  if (!result.handled) {
    return;
  }

  if (result.ok) {
    navigateTo(ROUTES.admin);
    return;
  }

  navigateTo(ROUTES.login, {
    error: result.error || "token-failed"
  });
}

function renderRankings() {
  const { flavorSelect, boardTitle, boardMeta, statsRow, rankingGrid } = ui.rankings;
  const shakes = getShakes();
  const groupedByFlavor = groupByFlavor(shakes);

  const selectedFlavor = FLAVORS.includes(state.selectedFlavor)
    ? state.selectedFlavor
    : DEFAULT_FLAVOR;
  state.selectedFlavor = selectedFlavor;

  if (flavorSelect) {
    flavorSelect.value = selectedFlavor;
  }

  const ranked = sortByRatingDesc(groupedByFlavor[selectedFlavor] || []);
  boardTitle.textContent = `${selectedFlavor} Rankings`;
  boardMeta.textContent = "Sorted by Nikki score";

  renderStats(statsRow, shakes, ranked, selectedFlavor);
  renderRankingCards(rankingGrid, ranked);
}

function renderStats(statsRowNode, allShakes, ranked, flavor) {
  const topShake = ranked[0];
  const averageScore =
    ranked.length === 0
      ? 0
      : ranked.reduce((sum, shake) => sum + Number(shake.rating), 0) / ranked.length;

  statsRowNode.innerHTML = `
    <div class="col-md-4">
      <article class="glass-shell stat-card stagger-item">
        <p class="text-body-secondary mb-1">Total ranked</p>
        <strong>${allShakes.length}</strong>
      </article>
    </div>
    <div class="col-md-4">
      <article class="glass-shell stat-card stagger-item">
        <p class="text-body-secondary mb-1">${escapeHtml(flavor)} average</p>
        <strong>${averageScore.toFixed(1)}</strong>
      </article>
    </div>
    <div class="col-md-4">
      <article class="glass-shell stat-card stagger-item">
        <p class="text-body-secondary mb-1">${escapeHtml(flavor)} champion</p>
        <strong>${topShake ? escapeHtml(topShake.name) : "None yet"}</strong>
      </article>
    </div>
  `;
}

function renderRankingCards(gridNode, ranked) {
  clearChildren(gridNode);

  if (!ranked.length) {
    gridNode.innerHTML = '<p class="text-body-secondary mb-0">No milkshakes ranked yet for this flavor.</p>';
    return;
  }

  ranked.forEach((shake, index) => {
    const cardNode = document.createElement("article");
    cardNode.className = "ranking-card stagger-item";
    cardNode.style.setProperty("--delay", `${index * 55}ms`);
    cardNode.innerHTML = `
      <img class="ranking-photo" src="${escapeHtml(shake.photo || FALLBACK_PHOTO_URL)}" alt="${escapeHtml(shake.name)} milkshake" loading="lazy" />
      <div class="ranking-body">
        <span class="badge rounded-pill text-bg-light border fw-semibold">#${index + 1}</span>
        <h3>${escapeHtml(shake.name)}</h3>
        <p class="meta">${escapeHtml(shake.shop)} · ${escapeHtml(shake.flavor)}</p>
        <p class="notes">${escapeHtml(shake.notes || "No tasting notes yet.")}</p>
        <p class="score-pill">Nikki Score: ${Number(shake.rating).toFixed(1)}</p>
      </div>
    `;
    gridNode.append(cardNode);
  });
}

function renderAdmin() {
  state.adminAuthorized = hasAdminAccess();
  state.rankerAuthorized = !state.adminAuthorized && hasRankerAccess();

  const hasWriteAccess = state.adminAuthorized || state.rankerAuthorized;

  if (ui.admin.flavorInput) {
    ui.admin.flavorInput.value = DEFAULT_FLAVOR;
  }

  if (ui.admin.formMessage) {
    setStatusMessage(
      ui.admin.formMessage,
      hasWriteAccess ? "" : ACCESS_REQUEST_MESSAGE,
      false
    );
  }

  setAdminControlsEnabled(hasWriteAccess);

  renderAdminList();
}

function onAdminFormSubmit(event) {
  event.preventDefault();
  if (!state.adminAuthorized && !state.rankerAuthorized) {
    setStatusMessage(ui.admin.formMessage, ACCESS_REQUEST_MESSAGE, false);
    return;
  }

  const formData = new FormData(ui.admin.form);

  const payload = {
    name: String(formData.get("name") || "").trim(),
    shop: String(formData.get("shop") || "").trim(),
    flavor: String(formData.get("flavor") || DEFAULT_FLAVOR),
    rating: Number(formData.get("rating")),
    photo: String(formData.get("photo") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
    uuid: window.firebaseAuth?.currentUser?.uid || ""
  };

  if (!payload.name || !payload.shop || Number.isNaN(payload.rating) || payload.rating < 1 || payload.rating > 10) {
    setStatusMessage(ui.admin.formMessage, "Please enter valid name, shop, and rating between 1 and 10.", true);
    return;
  }

  void addShake(payload).then(() => {
    ui.admin.form.reset();
    ui.admin.flavorInput.value = DEFAULT_FLAVOR;
    setStatusMessage(ui.admin.formMessage, "Milkshake saved.");
  }).catch((err) => {
    console.error("Error adding shake:", err);
    setMutationErrorMessage("saving", err);
  });
}

function onAdminListClick(event) {
  const unlockButton = event.target.closest("button[data-action='unlock-shake']");
  if (unlockButton) {
    const article = unlockButton.closest("article");
    article.querySelector(".shake-summary").classList.add("d-none");
    article.querySelector(".shake-edit").classList.remove("d-none");
    return;
  }

  const lockButton = event.target.closest("button[data-action='lock-shake']");
  if (lockButton) {
    const article = lockButton.closest("article");
    article.querySelector(".shake-summary").classList.remove("d-none");
    article.querySelector(".shake-edit").classList.add("d-none");
    return;
  }

  const deleteButton = event.target.closest("button[data-action='delete']");
  if (!deleteButton) {
    return;
  }

  const id = deleteButton.dataset.id;
  if (!id) {
    return;
  }

  const currentUid = window.firebaseAuth?.currentUser?.uid || "";
  const canDelete = state.adminAuthorized ||
    (state.rankerAuthorized && deleteButton.dataset.uuid === currentUid);
  if (!canDelete) {
    return;
  }

  void deleteShake(id)
    .then(() => {
      renderAdminList();
      if (ui.admin.formMessage) {
        setStatusMessage(ui.admin.formMessage, "Milkshake deleted.");
      }
    })
    .catch((err) => {
      console.error("Error deleting shake:", err);
      setMutationErrorMessage("deleting", err);
    });
}

function onAdminListChange(event) {
  const editableInput = event.target.closest("[data-action='field']");
  if (!editableInput) {
    return;
  }

  const currentUid = window.firebaseAuth?.currentUser?.uid || "";
  const canEdit = state.adminAuthorized ||
    (state.rankerAuthorized && editableInput.dataset.uuid === currentUid);
  if (!canEdit) {
    return;
  }

  const id = editableInput.dataset.id;
  const field = editableInput.dataset.field;
  if (!id || !field) {
    return;
  }

  const previousValue = String(editableInput.dataset.original || "");
  let nextValue;

  if (field === "rating") {
    const parsed = Number(editableInput.value);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 10) {
      editableInput.value = previousValue;
      return;
    }
    nextValue = Number(parsed.toFixed(1));
  } else {
    nextValue = String(editableInput.value || "").trim();
    if (field === "name" && !nextValue) {
      editableInput.value = previousValue;
      return;
    }
  }

  if (String(nextValue) === previousValue) {
    return;
  }

  const updates = { [field]: nextValue };

  void updateShake(id, updates)
    .then(() => {
      editableInput.dataset.original = String(nextValue);
      if (ui.admin.formMessage) {
        setStatusMessage(ui.admin.formMessage, "Milkshake updated.");
      }
    })
    .catch((err) => {
      console.error("Error updating shake:", err);
      editableInput.value = previousValue;
      setMutationErrorMessage("updating", err);
    });
}

function renderAdminList() {
  const ranked = sortByRatingDesc(getShakes());
  clearChildren(ui.admin.adminList);

  const currentUid = window.firebaseAuth?.currentUser?.uid || "";
  const hasWriteAccess = state.adminAuthorized || state.rankerAuthorized;

  if (!ranked.length) {
    ui.admin.adminList.innerHTML = hasWriteAccess
      ? '<p class="text-body-secondary mb-0">No shakes yet. Add one above.</p>'
      : '<p class="text-body-secondary mb-0">Access request pending. Once approved, your admin tools will appear here.</p>';
    return;
  }

  ranked.forEach((shake, index) => {
    const canEdit = state.adminAuthorized ||
      (state.rankerAuthorized && shake.uuid === currentUid);
    const shakeUuid = shake.uuid || "";

    const rowNode = document.createElement("article");
    rowNode.className = "admin-item stagger-item";
    rowNode.style.setProperty("--delay", `${index * 35}ms`);
    rowNode.innerHTML = canEdit
      ? `
      <div class="shake-summary">
        <div>
          <strong>${escapeHtml(shake.name)}</strong>
          <p class="meta mb-0">${escapeHtml(shake.shop)} · ${escapeHtml(shake.flavor)}</p>
        </div>
        <p class="meta mb-0">${escapeHtml(shake.notes || "No notes")}</p>
        <p class="badge text-bg-light border rounded-pill align-self-start mb-0">Score ${Number(shake.rating).toFixed(1)}</p>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-action="unlock-shake" data-id="${shake.id}">Edit</button>
      </div>
      <div class="shake-edit d-none">
        <div class="admin-edit-grid">
          <div>
            <label class="small text-body-secondary" for="name-${shake.id}">Name</label>
            <input
              id="name-${shake.id}"
              class="form-control form-control-sm"
              data-action="field"
              data-field="name"
              data-id="${shake.id}"
              data-uuid="${shakeUuid}"
              data-original="${escapeHtml(shake.name)}"
              type="text"
              maxlength="80"
              value="${escapeHtml(shake.name)}"
            />
            <p class="meta mt-1 mb-0">${escapeHtml(shake.shop)} · ${escapeHtml(shake.flavor)}</p>
          </div>
          <div>
            <label class="small text-body-secondary" for="notes-${shake.id}">Description</label>
            <textarea
              id="notes-${shake.id}"
              class="form-control form-control-sm"
              data-action="field"
              data-field="notes"
              data-id="${shake.id}"
              data-uuid="${shakeUuid}"
              data-original="${escapeHtml(shake.notes || "")}"
              rows="2"
              maxlength="240"
            >${escapeHtml(shake.notes || "")}</textarea>
          </div>
          <div>
            <label class="small text-body-secondary" for="photo-${shake.id}">Photo URL</label>
            <input
              id="photo-${shake.id}"
              class="form-control form-control-sm"
              data-action="field"
              data-field="photo"
              data-id="${shake.id}"
              data-uuid="${shakeUuid}"
              data-original="${escapeHtml(shake.photo || "")}"
              type="url"
              value="${escapeHtml(shake.photo || "")}"
            />
          </div>
        </div>
        <div class="d-flex align-items-center gap-2 justify-content-start justify-content-lg-end">
          <label class="small text-body-secondary" for="rate-${shake.id}">Score</label>
          <input
            id="rate-${shake.id}"
            class="form-control form-control-sm admin-score"
            data-action="field"
            data-field="rating"
            data-id="${shake.id}"
            data-uuid="${shakeUuid}"
            data-original="${Number(shake.rating).toFixed(1)}"
            type="number"
            min="1"
            max="10"
            step="0.1"
            value="${Number(shake.rating).toFixed(1)}"
          />
        </div>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-action="lock-shake" data-id="${shake.id}">Done</button>
          <button type="button" class="btn btn-outline-danger btn-sm" data-action="delete" data-id="${shake.id}" data-uuid="${shakeUuid}">Delete</button>
        </div>
      </div>
    `
      : `
      <div>
        <strong>${escapeHtml(shake.name)}</strong>
        <p class="meta mb-0">${escapeHtml(shake.shop)} · ${escapeHtml(shake.flavor)}</p>
      </div>
      <p class="meta mb-0">${escapeHtml(shake.notes || "No notes")}</p>
      <p class="badge text-bg-light border rounded-pill align-self-start mb-0">Score ${Number(shake.rating).toFixed(1)}</p>
    `;
    ui.admin.adminList.append(rowNode);
  });
}

function setAdminControlsEnabled(isEnabled) {
  ui.admin.form?.querySelectorAll("input, select, textarea, button[type='submit']").forEach((node) => {
    node.disabled = !isEnabled;
  });
}

function setMutationErrorMessage(action, err) {
  if (!ui.admin.formMessage) {
    return;
  }

  const permissionDenied =
    err?.code === "permission-denied" ||
    err?.name === "FirebaseError" ||
    String(err?.message || "").toLowerCase().includes("permission");

  const firebaseAuthFailed = Boolean(window.firebaseAuthReadyError) || !window.firebaseAuth?.currentUser;

  let sessionGroups = [];
  try {
    const session = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.authSession) || "null");
    sessionGroups = Array.isArray(session?.groups) ? session.groups : [];
  } catch {
    sessionGroups = [];
  }

  const hasAdminGroupInSession = sessionGroups.includes("shakesAdmin");

  if (permissionDenied && firebaseAuthFailed) {
    setStatusMessage(
      ui.admin.formMessage,
      `Firestore is blocking ${action} because you are not signed in with Firebase Auth. Sign in through PingOne and verify your Firestore rules.`,
      true
    );
    return;
  }

  if (permissionDenied && hasAdminGroupInSession) {
    setStatusMessage(
      ui.admin.formMessage,
      `Firestore blocked ${action}. You are signed in as shakesAdmin in the app session, but Firestore rules only see Firebase token claims. Map groups into request.auth.token.groups or temporarily use allow write: if request.auth != null.`,
      true
    );
    return;
  }

  if (permissionDenied) {
    setStatusMessage(
      ui.admin.formMessage,
      `Firestore is blocking ${action}. Check your Firestore rules and authenticated user status.`,
      true
    );
    return;
  }

  setStatusMessage(ui.admin.formMessage, `Error ${action} milkshake.`, true);
}
