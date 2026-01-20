const STORAGE_KEY = "projectPhaseTracker.projects.v1";
const SORT_STORAGE_KEY = "projectPhaseTracker.sortMode.v1";
const THEME_STORAGE_KEY = "projectPhaseTracker.theme.v1";
const APP_VERSION = "1.0";
const VALID_PHASES = ["Idea", "Build", "Fix", "Done"];
const PROJECT_LIMIT = 16;
const VIEW_STATES = ["dashboard", "completed", "abandoned"];
const SORT_MODES = ["lastUpdated", "createdAt", "dueDate", "phase"];
const PHASE_SORT_ORDER = ["Idea", "Build", "Fix", "Done"];
const THEMES = ["light", "dark"];
const SCHEMA_VERSION = 1;
const TOAST_DURATION_MS = 6000;

const parseTimestamp = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const compareTieBreakers = (a, b) => {
  const lastUpdatedDiff =
    (parseTimestamp(b.lastUpdated) ?? 0) - (parseTimestamp(a.lastUpdated) ?? 0);
  if (lastUpdatedDiff) {
    return lastUpdatedDiff;
  }

  const createdDiff =
    (parseTimestamp(b.createdAt) ?? 0) - (parseTimestamp(a.createdAt) ?? 0);
  if (createdDiff) {
    return createdDiff;
  }

  return a.id.localeCompare(b.id);
};

const applySort = (entries, mode) => {
  const normalizedMode = SORT_MODES.includes(mode) ? mode : "lastUpdated";
  return [...entries].sort((a, b) => {
    if (normalizedMode === "createdAt") {
      const diff = (parseTimestamp(b.createdAt) ?? 0) - (parseTimestamp(a.createdAt) ?? 0);
      return diff || compareTieBreakers(a, b);
    }

    if (normalizedMode === "dueDate") {
      const aDue = parseTimestamp(a.dueDate);
      const bDue = parseTimestamp(b.dueDate);
      const aHasDue = Number.isFinite(aDue);
      const bHasDue = Number.isFinite(bDue);
      if (aHasDue && bHasDue) {
        const diff = aDue - bDue;
        return diff || compareTieBreakers(a, b);
      }
      if (aHasDue) {
        return -1;
      }
      if (bHasDue) {
        return 1;
      }
      return compareTieBreakers(a, b);
    }

    if (normalizedMode === "phase") {
      const aIndex = PHASE_SORT_ORDER.indexOf(a.phase);
      const bIndex = PHASE_SORT_ORDER.indexOf(b.phase);
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      return compareTieBreakers(a, b);
    }

    const diff = (parseTimestamp(b.lastUpdated) ?? 0) - (parseTimestamp(a.lastUpdated) ?? 0);
    return diff || compareTieBreakers(a, b);
  });
};

const buildNotesByPhase = (recordPhase, recordNotesByPhase, legacyNotes) => {
  const bag = VALID_PHASES.reduce((acc, phase) => {
    acc[phase] = "";
    return acc;
  }, {});

  if (recordNotesByPhase && typeof recordNotesByPhase === "object") {
    VALID_PHASES.forEach((phase) => {
      const value = recordNotesByPhase[phase];
      if (typeof value === "string") {
        bag[phase] = value;
      }
    });
  }

  if (typeof legacyNotes === "string" && legacyNotes.trim()) {
    bag[recordPhase] = legacyNotes.trim();
  }

  return bag;
};

const normalizePhaseHistory = (entries) => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const from = VALID_PHASES.includes(entry.from) ? entry.from : "Idea";
      const to = VALID_PHASES.includes(entry.to) ? entry.to : "Idea";
      const atISO = entry.atISO ? toISO(entry.atISO) : getNowISO();

      return { from, to, atISO };
    })
    .filter(Boolean);
};

const normalizeDueDate = (value) => {
  if (!value) {
    return "";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }

  return new Date(parsed).toISOString().split("T")[0];
};

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const getNowISO = () => new Date().toISOString();

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `proj-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
};

const toISO = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : getNowISO();
};

const normalizeProject = (raw) => {
  const record = raw && typeof raw === "object" ? raw : {};
  const id = typeof record.id === "string" && record.id.trim() ? record.id : generateId();
  const name = normalizeText(record.name) || "Untitled Project";
  const phase = VALID_PHASES.includes(record.phase) ? record.phase : "Idea";
  const owner = normalizeText(record.owner);
  const notesByPhase = buildNotesByPhase(phase, record.notesByPhase, normalizeText(record.notes));
  const status = record.status === "abandoned" ? "abandoned" : "active";
  const createdAt = record.createdAt ? toISO(record.createdAt) : getNowISO();
  const lastUpdated = record.lastUpdated ? toISO(record.lastUpdated) : createdAt;
  const dueDate = normalizeDueDate(record.dueDate);
  const phaseHistory = normalizePhaseHistory(record.phaseHistory);

  return {
    id,
    name,
    phase,
    owner,
    notesByPhase,
    dueDate,
    phaseHistory,
    status,
    createdAt,
    lastUpdated,
  };
};

const loadProjects = () => {
  const payload = localStorage.getItem(STORAGE_KEY);
  if (!payload) {
    return [];
  }

  try {
    const parsed = JSON.parse(payload);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeProject);
    }

    if (parsed && typeof parsed === "object" && Array.isArray(parsed.projects)) {
      return parsed.projects.map(normalizeProject);
    }

    throw new Error("Payload is not an array or object");
  } catch (error) {
    console.warn("[Project Phase Tracker] Failed to parse stored projects.", error);
    return [];
  }
};

const saveProjects = (projects) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    flashSaveIndicator();
  } catch (error) {
    console.warn("[Project Phase Tracker] Failed to save projects.", error);
  }
};

const loadSortMode = () => {
  const stored = localStorage.getItem(SORT_STORAGE_KEY);
  return SORT_MODES.includes(stored) ? stored : "lastUpdated";
};

const loadTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(stored) ? stored : "light";
  } catch (error) {
    console.warn("[Project Phase Tracker] Failed to read stored theme.", error);
    return "light";
  }
};

const saveTheme = (theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn("[Project Phase Tracker] Failed to save theme.", error);
  }
};

const toThemePressedState = (theme) => (theme === "dark" ? "true" : "false");

const applyTheme = (theme, button) => {
  const normalized = THEMES.includes(theme) ? theme : "light";
  document.documentElement.dataset.theme = normalized;
  if (button) {
    button.setAttribute("aria-pressed", toThemePressedState(normalized));
  }
  return normalized;
};

const saveSortMode = (mode) => {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, mode);
  } catch (error) {
    console.warn("[Project Phase Tracker] Failed to save sort mode.", error);
  }
};

const getCompletedProjects = (projects) =>
  projects.filter((project) => project.status === "active" && project.phase === "Done");

const getAbandonedProjects = (projects) =>
  projects.filter((project) => project.status === "abandoned");

const getProjectsForView = (projects, view) => {
  switch (view) {
    case "completed":
      return getCompletedProjects(projects);
    case "abandoned":
      return getAbandonedProjects(projects);
    default:
      return getDashboardProjects(projects);
  }
};

const changeProjectPhase = (projectId, nextPhase) => {
  if (!VALID_PHASES.includes(nextPhase)) {
    return null;
  }

  const now = getNowISO();
  let updatedProject = null;
  let previousPhase = null;
  const nextProjects = projects.map((project) => {
    if (project.id !== projectId) {
      return project;
    }

    if (project.phase === nextPhase) {
      return project;
    }

    previousPhase = project.phase;
    const history = Array.isArray(project.phaseHistory) ? project.phaseHistory : [];
    updatedProject = {
      ...project,
      phase: nextPhase,
      lastUpdated: now,
      phaseHistory: [...history, { from: project.phase, to: nextPhase, atISO: now }],
    };
    return updatedProject;
  });

  if (!updatedProject) {
    return null;
  }

  projects = nextProjects;
  saveProjects(projects);

  if (nextPhase === "Done" && updatedProject.status === "active" && previousPhase) {
    lastDoneAction = {
      projectId,
      previousPhase,
      previousView: currentView,
    };
    showToast({
      message: "Moved to Completed.",
      actionLabel: "Undo",
      onAction: undoLastDoneAction,
    });
  }

  if (selectedProjectId === projectId) {
    inspectorNotesPhase = nextPhase;
  }

  render();
  return updatedProject;
};

const applyProjectPatch = (projectId, changes, { skipRender = false } = {}) => {
  let updatedProject = null;
  const now = getNowISO();
  const nextProjects = projects.map((project) => {
    if (project.id !== projectId) {
      return project;
    }

    const next = {
      ...project,
      ...changes,
      lastUpdated: now,
    };

    updatedProject = next;
    return next;
  });

  if (!updatedProject) {
    return null;
  }

  projects = nextProjects;
  saveProjects(projects);
  return updatedProject;
};

const getDashboardProjects = (projects) =>
  projects.filter((project) => project.status === "active" && project.phase !== "Done");

const canCreateNewProject = (projects) => getDashboardProjects(projects).length < PROJECT_LIMIT;

const createProject = ({
  name,
  phase,
  owner = "",
  notesByPhase,
  notes = "",
  dueDate = "",
  lastUpdated,
} = {}) => {
  const now = getNowISO();
  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    return null;
  }
  const normalizedPhase = VALID_PHASES.includes(phase) ? phase : "Idea";
  const normalizedNotesByPhase = buildNotesByPhase(
    normalizedPhase,
    notesByPhase,
    normalizeText(notes)
  );

  return {
    id: generateId(),
    name: normalizedName,
    phase: normalizedPhase,
    owner: normalizeText(owner),
    notesByPhase: normalizedNotesByPhase,
    dueDate: normalizeDueDate(dueDate),
    phaseHistory: [],
    status: "active",
    createdAt: now,
    lastUpdated: lastUpdated ? toISO(lastUpdated) : now,
  };
};

const upsertProject = (projects, project) => {
  const exists = projects.some((entry) => entry.id === project.id);

  if (exists) {
    return projects.map((entry) => (entry.id === project.id ? { ...entry, ...project } : entry));
  }

  return [...projects, project];
};

const createDraftProject = () => ({
  name: "",
  phase: "Idea",
  owner: "",
  notesByPhase: buildNotesByPhase("Idea", null, ""),
  dueDate: "",
});

const updateDraftProject = (changes) => {
  if (!draftProject) {
    return;
  }
  draftProject = { ...draftProject, ...changes };
};

const cancelDraftProject = () => {
  draftProject = null;
};

const projectsGrid = document.getElementById("projectsGrid");
const emptyState = document.getElementById("emptyState");
const emptyStateLabel = emptyState?.querySelector(".empty-state__label");
const emptyStateHint = emptyState?.querySelector(".empty-state__hint");
const capacityIndicator = document.getElementById("capacityIndicator");
const capacityFeedback = document.getElementById("capacityFeedback");
let capacityFeedbackTimer;
const mainContent = document.querySelector(".main-content");
const canvasCenter = document.querySelector(".canvas-center");
const sortSelect = document.getElementById("sortSelect");
const searchInputTop = document.getElementById("searchInputTop");
const searchInputDrawer = document.getElementById("searchInputDrawer");
const exportButton = document.getElementById("btnExport");
const exportButtonDrawer = document.getElementById("btnExportDrawer");
const importButton = document.getElementById("btnImport");
const importButtonDrawer = document.getElementById("btnImportDrawer");
const helpButton = document.getElementById("btnHelp");
const helpButtonDrawer = document.getElementById("btnHelpDrawer");
const importFileInput = document.getElementById("importFileInput");
const railBackdrop = document.getElementById("railBackdrop");
const inspectorBackdrop = document.getElementById("inspectorBackdrop");
const modalBackdrop = document.getElementById("modalBackdrop");
const importModal = document.getElementById("importModal");
const importCloseButton = document.getElementById("importClose");
const importMergeButton = document.getElementById("importMerge");
const importReplaceButton = document.getElementById("importReplace");
const helpModal = document.getElementById("helpModal");
const helpCloseButton = document.getElementById("helpClose");
const helpVersionLabel = document.getElementById("helpVersion");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");
const toastAction = document.getElementById("toastAction");
const viewButtons = Array.from(document.querySelectorAll("[data-view-option]"));
let currentView = "dashboard";
let currentSortMode = loadSortMode();
let searchQuery = "";
if (helpVersionLabel) {
  helpVersionLabel.textContent = `Version ${APP_VERSION}`;
}
const EMPTY_STATE_COPY = {
  dashboard: {
    title: "No projects yet",
    hint: "Start a new project to see your roadmap take shape.",
  },
  completed: {
    title: "No completed projects yet",
    hint: "Projects marked Done will appear here.",
  },
  abandoned: {
    title: "No abandoned projects",
    hint: "Abandoned projects will appear here.",
  },
};
const FIRST_TIME_EMPTY_COPY = {
  title: "Create your first project to get started.",
  hint: "Projects move through Idea → Build → Fix → Done.",
};

const leftRail = document.querySelector(".left-rail");
const rightInspector = document.querySelector(".right-inspector");
const inspectorNameInput = document.getElementById("inspectorName");
const inspectorOwnerInput = document.getElementById("inspectorOwner");
const inspectorPhaseSelect = document.getElementById("inspectorPhase");
const inspectorDueDateInput = document.getElementById("inspectorDueDate");
const inspectorClearDueDateButton = document.getElementById("inspectorClearDueDate");
const inspectorHistoryList = document.getElementById("inspectorHistoryList");
const inspectorCreated = document.getElementById("inspectorCreated");
const inspectorUpdated = document.getElementById("inspectorUpdated");
const inspectorCloseButton = document.getElementById("inspectorClose");
const inspectorCreateButton = document.getElementById("inspectorCreate");
const inspectorAbandonButton = document.getElementById("inspectorAbandon");
const inspectorAbandonConfirm = document.getElementById("inspectorAbandonConfirm");
const inspectorPhaseAnchor = document.getElementById("inspectorPhaseAnchor");
const inspectorSavedIndicator = document.getElementById("inspectorSavedIndicator");
const notesTabButtons = Array.from(document.querySelectorAll(".notes-tab"));
const notesPanels = Array.from(document.querySelectorAll(".notes-panel"));
const notesTextareas = Array.from(document.querySelectorAll("[data-notes-panel]"));
let selectedProjectId = null;
let draftProject = null;
let inspectorNotesPhase = "Idea";
let pendingAction = null;
let lastDoneAction = null;
let pendingImport = null;
let toastTimer;
let savedIndicatorTimer;
let activeTrap = null;
let lastFocusedElement = null;
let inspectorReturnFocus = null;

const updateCapacityIndicator = (activeCount) => {
  if (!capacityIndicator) {
    return;
  }

  capacityIndicator.textContent = `${activeCount} / ${PROJECT_LIMIT}`;
  const isFull = activeCount >= PROJECT_LIMIT;
  const nearThreshold = Math.max(0, PROJECT_LIMIT - 2);
  const isNear = !isFull && activeCount >= nearThreshold;
  capacityIndicator.dataset.full = isFull ? "true" : "false";
  capacityIndicator.dataset.urgency = isFull ? "full" : isNear ? "near" : "normal";
  const fillPercent = Math.min(100, Math.round((activeCount / PROJECT_LIMIT) * 100));
  capacityIndicator.style.setProperty("--capacity-fill", `${fillPercent}%`);
  capacityIndicator.dataset.fillPercent = fillPercent.toString();
  if (createButton) {
    createButton.dataset.capacityState = isFull ? "full" : isNear ? "near" : "default";
  }
};

const showCapacityFeedback = (message) => {
  if (!capacityFeedback) {
    return;
  }

  capacityFeedback.textContent = message;
  capacityFeedback.hidden = false;

  if (capacityFeedbackTimer) {
    clearTimeout(capacityFeedbackTimer);
  }

  capacityFeedbackTimer = setTimeout(() => {
    capacityFeedback.hidden = true;
  }, 3200);
};

const formatRelativeTime = (isoString) => {
  const timestamp = Date.parse(isoString);
  if (!Number.isFinite(timestamp)) {
    return "just now";
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) {
    return "just now";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const getFocusableElements = (container) => {
  if (!container) {
    return [];
  }
  return Array.from(container.querySelectorAll(focusableSelector)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[hidden]")
  );
};

const deactivateFocusTrap = () => {
  activeTrap = null;
  if (lastFocusedElement && document.contains(lastFocusedElement)) {
    requestAnimationFrame(() => lastFocusedElement?.focus?.());
  }
  lastFocusedElement = null;
};

const activateFocusTrap = (container, { initialFocusEl, onClose } = {}) => {
  if (!container) {
    return;
  }
  if (activeTrap) {
    lastFocusedElement = null;
    deactivateFocusTrap();
  }
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeTrap = { container, onClose };
  const focusable = getFocusableElements(container);
  const target = initialFocusEl || focusable[0];
  if (target) {
    requestAnimationFrame(() => target.focus());
  }
};

const handleTrapKeydown = (event) => {
  if (!activeTrap || event.key !== "Tab") {
    return false;
  }
  const focusable = getFocusableElements(activeTrap.container);
  if (!focusable.length) {
    event.preventDefault();
    return true;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const isShift = event.shiftKey;
  const activeElement = document.activeElement;

  if (isShift && activeElement === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!isShift && activeElement === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
};

const showBackdrop = (backdrop, isVisible) => {
  if (backdrop) {
    backdrop.hidden = !isVisible;
  }
};

const openModal = (modalElement, focusTarget) => {
  if (!modalElement) {
    return;
  }
  modalElement.hidden = false;
  showBackdrop(modalBackdrop, true);
  activateFocusTrap(modalElement, {
    onClose: () => closeModal(modalElement),
    initialFocusEl: focusTarget,
  });
};

const closeModal = (modalElement) => {
  if (!modalElement) {
    return;
  }
  modalElement.hidden = true;
  showBackdrop(modalBackdrop, false);
  deactivateFocusTrap();
};

const showToast = ({ message, actionLabel, onAction, duration = TOAST_DURATION_MS }) => {
  if (!toast || !toastMessage || !toastAction) {
    return;
  }

  toastMessage.textContent = message;
  if (onAction) {
    toastAction.textContent = actionLabel || "Undo";
    toastAction.hidden = false;
    toastAction.onclick = () => {
      onAction();
      hideToast();
    };
  } else {
    toastAction.hidden = true;
    toastAction.onclick = null;
  }

  toast.hidden = false;
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    hideToast();
  }, duration);
};

const hideToast = () => {
  if (!toast) {
    return;
  }
  toast.hidden = true;
  toastAction && (toastAction.onclick = null);
};

const flashSaveIndicator = () => {
  if (!inspectorSavedIndicator) {
    return;
  }
  inspectorSavedIndicator.classList.add("is-visible");
  if (savedIndicatorTimer) {
    clearTimeout(savedIndicatorTimer);
  }
  savedIndicatorTimer = setTimeout(() => {
    inspectorSavedIndicator.classList.remove("is-visible");
  }, 1600);
};

const applySearchFilter = (entries, query) => {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return entries;
  }
  return entries.filter((project) => {
    const haystack = `${project.name} ${project.owner}`.toLowerCase();
    return haystack.includes(trimmed);
  });
};

const ensureVisibleInContainer = (element, container) => {
  if (!element || !container) {
    return;
  }
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const isAbove = elementRect.top < containerRect.top;
  const isBelow = elementRect.bottom > containerRect.bottom;
  if (isAbove || isBelow) {
    element.scrollIntoView({ block: "nearest" });
  }
};

const ensureDashboardWorkspaceVisible = () => {
  if (currentView !== "dashboard") {
    setView("dashboard");
  }
  if (canvasCenter) {
    canvasCenter.scrollTo({ top: 0 });
  }
  ensureVisibleInContainer(projectsGrid, canvasCenter);
};

const syncSearchInputs = (value, source) => {
  if (searchInputTop && source !== searchInputTop) {
    searchInputTop.value = value;
  }
  if (searchInputDrawer && source !== searchInputDrawer) {
    searchInputDrawer.value = value;
  }
};

const setSearchQuery = (value, source) => {
  searchQuery = value;
  syncSearchInputs(value, source);
  render();
};

const buildExportPayload = () => ({
  schemaVersion: SCHEMA_VERSION,
  exportedAt: getNowISO(),
  projects,
});

const downloadJSON = (payload, filename) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const normalizeImportPayload = (payload) => {
  if (Array.isArray(payload)) {
    return payload.map(normalizeProject);
  }
  if (payload && typeof payload === "object") {
    const schemaVersion =
      typeof payload.schemaVersion === "number" ? payload.schemaVersion : SCHEMA_VERSION;
    if (schemaVersion !== SCHEMA_VERSION) {
      throw new Error("Unsupported schema version");
    }
    if (!Array.isArray(payload.projects)) {
      throw new Error("Import payload missing projects");
    }
    const list = payload.projects;
    return list.map(normalizeProject);
  }
  throw new Error("Invalid import payload");
};

const mergeImportedProjects = (current, incoming) => {
  const merged = new Map(current.map((project) => [project.id, project]));
  // Imported records overwrite matching ids to keep the latest incoming data.
  incoming.forEach((project) => {
    merged.set(project.id, project);
  });
  return Array.from(merged.values());
};

const undoLastDoneAction = () => {
  if (!lastDoneAction) {
    return;
  }

  const { projectId, previousPhase, previousView } = lastDoneAction;
  const now = getNowISO();
  let updatedProject = null;
  projects = projects.map((project) => {
    if (project.id !== projectId) {
      return project;
    }
    const history = Array.isArray(project.phaseHistory) ? project.phaseHistory : [];
    updatedProject = {
      ...project,
      phase: previousPhase,
      lastUpdated: now,
      phaseHistory: [...history, { from: project.phase, to: previousPhase, atISO: now }],
    };
    return updatedProject;
  });

  if (!updatedProject) {
    lastDoneAction = null;
    return;
  }

  saveProjects(projects);
  currentView = previousView;
  syncViewUI();
  if (selectedProjectId === projectId) {
    inspectorNotesPhase = previousPhase;
  }
  lastDoneAction = null;
  render();
};

const render = () => {
  const dashboardProjects = getDashboardProjects(projects);
  updateCapacityIndicator(dashboardProjects.length);

  const viewProjects = getProjectsForView(projects, currentView);
  const filteredProjects = applySearchFilter(viewProjects, searchQuery);
  const visibleProjects = applySort(filteredProjects, currentSortMode);
  const stateCopy = EMPTY_STATE_COPY[currentView] || EMPTY_STATE_COPY.dashboard;
  const isSearching = Boolean(searchQuery.trim());
  const isFirstTime = projects.length === 0 && currentView === "dashboard";
  const emptyCopy = isSearching
    ? {
        title: "No matching projects",
        hint: "Try a different name or owner.",
      }
    : isFirstTime
      ? FIRST_TIME_EMPTY_COPY
      : stateCopy;

  if (emptyStateLabel) {
    emptyStateLabel.textContent = emptyCopy.title;
  }

  if (emptyStateHint) {
    emptyStateHint.textContent = emptyCopy.hint;
  }

  if (emptyState) {
    emptyState.hidden = visibleProjects.length > 0;
  }

  if (!projectsGrid) {
    return;
  }

  projectsGrid.hidden = visibleProjects.length === 0;
  projectsGrid.innerHTML = "";

  visibleProjects.forEach((project) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.dataset.phase = project.phase;
    card.dataset.projectId = project.id;
    if (project.id === selectedProjectId) {
      card.classList.add("is-selected");
    }
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-pressed", project.id === selectedProjectId ? "true" : "false");
    const phaseAnchor = document.createElement("span");
    phaseAnchor.className = "phase-anchor phase-anchor--card";
    phaseAnchor.dataset.phase = project.phase;
    phaseAnchor.setAttribute("title", project.phase);
    phaseAnchor.setAttribute("aria-hidden", "true");
    card.appendChild(phaseAnchor);
    card.addEventListener("click", () => openInspectorForProject(project.id, card));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openInspectorForProject(project.id, card);
      }
    });

    const content = document.createElement("div");
    content.className = "project-card__content";

    const title = document.createElement("p");
    title.className = "project-card__title";
    title.textContent = project.name;
    title.title = project.name;
    content.appendChild(title);

    if (project.owner) {
      const owner = document.createElement("p");
      owner.className = "project-card__owner";
      owner.textContent = `Owner: ${project.owner}`;
      content.appendChild(owner);
    }

    const meta = document.createElement("p");
    meta.className = "project-card__meta";
    meta.textContent = `Updated ${formatRelativeTime(project.lastUpdated)}`;
    content.appendChild(meta);

    const footer = document.createElement("div");
    footer.className = "project-card__footer";

    const phaseSelect = document.createElement("select");
    phaseSelect.className = "project-card__phase-select";
    phaseSelect.setAttribute("aria-label", "Change project phase");
    VALID_PHASES.forEach((phase) => {
      const option = document.createElement("option");
      option.value = phase;
      option.textContent = phase;
      if (phase === project.phase) {
        option.selected = true;
      }
      phaseSelect.appendChild(option);
    });

    const stopCardClick = (event) => {
      event.stopPropagation();
    };

    ["pointerdown", "pointerup", "mousedown", "click", "keydown"].forEach((type) => {
      phaseSelect.addEventListener(type, stopCardClick);
    });

    phaseSelect.addEventListener("change", (event) => {
      event.stopPropagation();
      const selectElement = event.currentTarget;
      if (!(selectElement instanceof HTMLSelectElement)) {
        return;
      }
      changeProjectPhase(project.id, selectElement.value);
    });

    footer.appendChild(phaseSelect);

    if (currentView !== "dashboard") {
      const actions = document.createElement("div");
      actions.className = "project-card__actions";

      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.className = "restore";
      restoreButton.textContent = "Restore";
      restoreButton.addEventListener("click", (event) => {
        event.stopPropagation();
        handleRestoreProject(project);
      });
      actions.appendChild(restoreButton);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete";
      const isPendingDelete =
        pendingAction?.type === "delete" && pendingAction.projectId === project.id;
      deleteButton.textContent = isPendingDelete ? "Confirm delete" : "Delete permanently";
      deleteButton.classList.toggle("is-pending", isPendingDelete);
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        handleDeleteProject(project.id);
      });

      actions.appendChild(deleteButton);
      content.appendChild(actions);
    }

    card.append(content, footer);
    projectsGrid.appendChild(card);
  });

  if (document.body) {
    const showCreateCue = isFirstTime && !isSearching;
    if (showCreateCue) {
      document.body.dataset.showCreateCue = "true";
    } else {
      delete document.body.dataset.showCreateCue;
    }
  }

  updateWorkspaceScrollCue();
  renderInspector();
};

const updateWorkspaceScrollCue = () => {
  if (!canvasCenter) {
    return;
  }
  const scrollable = canvasCenter.scrollHeight > canvasCenter.clientHeight + 4;
  canvasCenter.dataset.scrollable = scrollable ? "true" : "false";
  canvasCenter.dataset.scrolled = canvasCenter.scrollTop > 6 ? "true" : "false";
};

const cancelPendingAction = () => {
  pendingAction = null;
  inspectorAbandonConfirm?.classList.remove("is-visible");
};

const openDraftInspector = (focusOrigin = null) => {
  if (!mainContent) {
    return;
  }

  if (isMobile()) {
    closeLeftRail({ restoreFocus: false });
  }

  draftProject = createDraftProject();
  selectedProjectId = null;
  inspectorNotesPhase = "Idea";
  mainContent.dataset.inspectorOpen = "true";
  cancelPendingAction();
  if (focusOrigin instanceof HTMLElement) {
    inspectorReturnFocus = focusOrigin;
  }
  render();
  if (isMobile()) {
    showBackdrop(inspectorBackdrop, true);
    rightInspector?.setAttribute("role", "dialog");
    rightInspector?.setAttribute("aria-modal", "true");
    activateFocusTrap(rightInspector, {
      onClose: () => {
        closeInspector();
        render();
      },
      initialFocusEl: inspectorNameInput || inspectorCloseButton,
    });
  }

  requestAnimationFrame(() => {
    inspectorNameInput?.focus();
  });
};

const openInspectorForProject = (projectId, focusOrigin = null) => {
  const project = projects.find((item) => item.id === projectId);
  if (!project || !mainContent) {
    closeInspector();
    render();
    return;
  }

  if (isMobile()) {
    closeLeftRail({ restoreFocus: false });
  }

  cancelDraftProject();
  selectedProjectId = projectId;
  inspectorNotesPhase = project.phase;
  mainContent.dataset.inspectorOpen = "true";
  cancelPendingAction();
  if (focusOrigin instanceof HTMLElement) {
    inspectorReturnFocus = focusOrigin;
  }
  render();
  if (isMobile()) {
    showBackdrop(inspectorBackdrop, true);
    rightInspector?.setAttribute("role", "dialog");
    rightInspector?.setAttribute("aria-modal", "true");
    activateFocusTrap(rightInspector, {
      onClose: () => {
        closeInspector();
        render();
      },
      initialFocusEl: inspectorCloseButton || inspectorNameInput,
    });
  }
};

const closeInspector = () => {
  cancelDraftProject();
  selectedProjectId = null;
  if (mainContent) {
    mainContent.dataset.inspectorOpen = "false";
  }
  cancelPendingAction();
  showBackdrop(inspectorBackdrop, false);
  if (activeTrap?.container === rightInspector) {
    lastFocusedElement = null;
    deactivateFocusTrap();
  }
  rightInspector?.removeAttribute("role");
  rightInspector?.removeAttribute("aria-modal");
  if (inspectorReturnFocus instanceof HTMLElement && document.contains(inspectorReturnFocus)) {
    inspectorReturnFocus.focus();
  }
  inspectorReturnFocus = null;
};

const renderInspector = () => {
  if (!rightInspector || mainContent?.dataset.inspectorOpen !== "true") {
    return;
  }

  const isDraft = !selectedProjectId && Boolean(draftProject);
  const project = selectedProjectId
    ? projects.find((item) => item.id === selectedProjectId)
    : draftProject;
  if (!project) {
    closeInspector();
    return;
  }

  syncInspectorPhaseAnchor(project.phase);

  if (inspectorNameInput) {
    inspectorNameInput.value = project.name || "";
  }
  if (inspectorOwnerInput) {
    inspectorOwnerInput.value = project.owner || "";
  }
  if (inspectorPhaseSelect) {
    inspectorPhaseSelect.value = project.phase || "Idea";
  }
  if (inspectorDueDateInput) {
    inspectorDueDateInput.value = project.dueDate || "";
  }
  notesTabButtons.forEach((button) => {
    const phase = button.dataset.notesPhase;
    const isActive = phase === inspectorNotesPhase;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
    const panel = notesPanels.find((item) => item.querySelector(`[data-notes-panel="${phase}"]`));
    if (panel) {
      button.setAttribute("aria-controls", panel.id);
      panel.hidden = !isActive;
    }
  });
  notesTextareas.forEach((textarea) => {
    const phase = textarea.dataset.notesPanel;
    if (!phase) {
      return;
    }
    textarea.value = project.notesByPhase?.[phase] || "";
  });

  if (inspectorHistoryList) {
    if (isDraft) {
      inspectorHistoryList.innerHTML = "";
    } else {
      const history = Array.isArray(project.phaseHistory) ? project.phaseHistory.slice().reverse() : [];
      inspectorHistoryList.innerHTML = history
        .map((entry) => {
          const atLabel = entry.atISO ? new Date(entry.atISO).toLocaleString() : "Unknown";
          return `<li><span class="phase-anchor phase-anchor--history" data-phase="${entry.to}" aria-hidden="true"></span>${entry.from} → ${entry.to} · ${atLabel}</li>`;
        })
        .join("");
    }
  }

  if (inspectorCreated) {
    inspectorCreated.textContent = isDraft
      ? "N/A"
      : new Date(project.createdAt).toLocaleDateString();
  }
  if (inspectorUpdated) {
    inspectorUpdated.textContent = isDraft ? "N/A" : formatRelativeTime(project.lastUpdated);
  }

  if (inspectorCreateButton) {
    inspectorCreateButton.hidden = !isDraft;
  }
  if (inspectorAbandonButton) {
    inspectorAbandonButton.hidden = isDraft;
  }
  if (inspectorAbandonConfirm) {
    inspectorAbandonConfirm.hidden = isDraft;
  }

  const mustConfirmAbandon =
    !isDraft && pendingAction?.type === "abandon" && pendingAction.projectId === project.id;
  inspectorAbandonConfirm?.classList.toggle("is-visible", Boolean(mustConfirmAbandon));
};

const handleRestoreProject = (project) => {
  if (!project) {
    return;
  }

  if (!canCreateNewProject(projects)) {
    showCapacityFeedback(`Maximum of ${PROJECT_LIMIT} active projects reached`);
    return;
  }

  const normalizedPhase = project.phase === "Done" ? "Fix" : project.phase || "Fix";
  const now = getNowISO();
  const shouldAddHistory = project.phase !== normalizedPhase;
  const nextProjects = projects.map((entry) => {
    if (entry.id !== project.id) {
      return entry;
    }
    const history = shouldAddHistory
      ? [...(entry.phaseHistory || []), { from: entry.phase, to: normalizedPhase, atISO: now }]
      : entry.phaseHistory;
    return {
      ...entry,
      status: "active",
      phase: normalizedPhase,
      phaseHistory: history,
      lastUpdated: now,
    };
  });

  projects = nextProjects;
  saveProjects(projects);
  cancelPendingAction();
  closeInspector();
  render();
};

const performDeleteProject = (projectId) => {
  projects = projects.filter((project) => project.id !== projectId);
  saveProjects(projects);
  if (selectedProjectId === projectId) {
    closeInspector();
  }
  pendingAction = null;
  render();
};

const handleDeleteProject = (projectId) => {
  if (pendingAction?.type === "delete" && pendingAction.projectId === projectId) {
    performDeleteProject(projectId);
    return;
  }

  pendingAction = { type: "delete", projectId };
  render();
};

const performAbandonProject = (projectId) => {
  const now = getNowISO();
  projects = projects.map((project) =>
    project.id !== projectId
      ? project
      : {
          ...project,
          status: "abandoned",
          lastUpdated: now,
        }
  );
  saveProjects(projects);
  pendingAction = null;
  closeInspector();
  render();
};

const handleAbandonClick = () => {
  if (!selectedProjectId) {
    return;
  }

  if (pendingAction?.type === "abandon" && pendingAction.projectId === selectedProjectId) {
    performAbandonProject(selectedProjectId);
    return;
  }

  pendingAction = { type: "abandon", projectId: selectedProjectId };
  inspectorAbandonConfirm?.classList.add("is-visible");
};

const confirmDraftProject = () => {
  if (!draftProject) {
    return;
  }

  const nameValue = normalizeText(inspectorNameInput?.value || draftProject.name);
  if (!nameValue) {
    showToast({ message: "Enter a project name to create." });
    inspectorNameInput?.focus();
    return;
  }

  if (!canCreateNewProject(projects)) {
    showCapacityFeedback(`Maximum of ${PROJECT_LIMIT} active projects reached`);
    return;
  }

  const nextProject = createProject({
    name: nameValue,
    phase: draftProject.phase,
    owner: draftProject.owner,
    notesByPhase: draftProject.notesByPhase,
    dueDate: draftProject.dueDate,
  });

  if (!nextProject) {
    return;
  }

  projects = upsertProject(projects, nextProject);
  saveProjects(projects);
  logProjectCounts(projects);
  selectedProjectId = nextProject.id;
  draftProject = null;
  inspectorNotesPhase = nextProject.phase;
  render();
};

const executePendingAction = () => {
  if (!pendingAction) {
    return;
  }

  if (pendingAction.type === "delete") {
    performDeleteProject(pendingAction.projectId);
  } else if (pendingAction.type === "abandon") {
    performAbandonProject(pendingAction.projectId);
  }
};

const syncViewUI = () => {
  if (mainContent) {
    mainContent.dataset.view = currentView;
  }

  viewButtons.forEach((button) => {
    const viewOption = button.dataset.viewOption;
    const isActive = viewOption === currentView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });
};

const setView = (nextView) => {
  if (!VIEW_STATES.includes(nextView) || currentView === nextView) {
    return;
  }
  currentView = nextView;
  syncViewUI();
  closeInspector();
  render();
};

const countProjects = (projects) => {
  const activeCount = projects.filter((project) => project.status === "active").length;
  const abandonedCount = projects.filter((project) => project.status === "abandoned").length;
  return {
    total: projects.length,
    active: activeCount,
    abandoned: abandonedCount,
  };
};

const logProjectCounts = (projects) => {
  const { total, active, abandoned } = countProjects(projects);
  console.log(
    `[Project Phase Tracker] Projects loaded: total=${total}, active=${active}, abandoned=${abandoned}`
  );
};

const settingsButton = document.getElementById("btnSettings");
const themeButton = document.getElementById("btnTheme");
const createButton = document.getElementById("btnCreate");
let currentTheme = applyTheme(loadTheme(), themeButton);

let projects = loadProjects();
logProjectCounts(projects);
syncViewUI();
if (sortSelect) {
  sortSelect.value = currentSortMode;
}
render();
syncSearchInputs(searchQuery);

const openLeftRail = () => {
  if (!mainContent) {
    return;
  }

  mainContent.dataset.railOpen = "true";
  document.body.dataset.railOpen = "true";
  settingsButton?.setAttribute("aria-pressed", "true");

  if (isMobile()) {
    showBackdrop(railBackdrop, true);
    leftRail?.setAttribute("role", "dialog");
    leftRail?.setAttribute("aria-modal", "true");
    activateFocusTrap(leftRail, {
      onClose: () => closeLeftRail(),
      initialFocusEl: searchInputDrawer || leftRail?.querySelector("button"),
    });
  }
};

const closeLeftRail = ({ restoreFocus = true } = {}) => {
  if (!mainContent) {
    return;
  }

  mainContent.dataset.railOpen = "false";
  document.body.dataset.railOpen = "false";
  settingsButton?.setAttribute("aria-pressed", "false");

  showBackdrop(railBackdrop, false);
  if (activeTrap?.container === leftRail) {
    if (!restoreFocus) {
      lastFocusedElement = null;
    }
    deactivateFocusTrap();
  }
  leftRail?.removeAttribute("role");
  leftRail?.removeAttribute("aria-modal");
  if (restoreFocus && settingsButton) {
    settingsButton.focus();
  }
};

const toggleLeftRail = () => {
  if (!mainContent) {
    return;
  }
  const isOpen = mainContent.dataset.railOpen === "true";
  if (isOpen) {
    closeLeftRail();
  } else {
    openLeftRail();
  }
};

settingsButton?.addEventListener("click", () => {
  toggleLeftRail();
});

railBackdrop?.addEventListener("click", () => {
  closeLeftRail();
});

inspectorBackdrop?.addEventListener("click", () => {
  closeInspector();
  render();
});

modalBackdrop?.addEventListener("click", () => {
  if (importModal && !importModal.hidden) {
    closeModal(importModal);
  }
  if (helpModal && !helpModal.hidden) {
    closeModal(helpModal);
  }
});

themeButton?.addEventListener("click", () => {
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  currentTheme = applyTheme(nextTheme, themeButton);
  saveTheme(currentTheme);
});

[searchInputTop, searchInputDrawer].forEach((input) => {
  if (!input) {
    return;
  }
  input.addEventListener("input", (event) => {
    setSearchQuery(event.currentTarget.value, input);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setSearchQuery("", input);
    }
  });
});

const handleExport = () => {
  closeLeftRail({ restoreFocus: false });
  const payload = buildExportPayload();
  const dateStamp = new Date().toISOString().split("T")[0];
  downloadJSON(payload, `project-phase-tracker-export-${dateStamp}.json`);
  showToast({ message: "Export ready." });
};

[exportButton, exportButtonDrawer].forEach((button) => {
  button?.addEventListener("click", handleExport);
});

const handleImportClick = () => {
  closeLeftRail({ restoreFocus: false });
  if (importFileInput) {
    importFileInput.value = "";
    importFileInput.click();
  }
};

[importButton, importButtonDrawer].forEach((button) => {
  button?.addEventListener("click", handleImportClick);
});

[helpButton, helpButtonDrawer].forEach((button) => {
  button?.addEventListener("click", () => {
    closeLeftRail({ restoreFocus: false });
    openModal(helpModal, helpCloseButton || helpModal?.querySelector("button"));
  });
});

helpCloseButton?.addEventListener("click", () => {
  closeModal(helpModal);
});

importCloseButton?.addEventListener("click", () => {
  closeModal(importModal);
  pendingImport = null;
});

importFileInput?.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const parsed = JSON.parse(raw);
      const normalized = normalizeImportPayload(parsed);
      pendingImport = normalized;
      openModal(importModal, importMergeButton || importReplaceButton);
    } catch (error) {
      console.warn("[Project Phase Tracker] Import failed.", error);
      showToast({ message: "Import failed. Check the file format." });
    }
  };
  reader.readAsText(file);
});

importMergeButton?.addEventListener("click", () => {
  if (!pendingImport) {
    return;
  }
  projects = mergeImportedProjects(projects, pendingImport);
  saveProjects(projects);
  logProjectCounts(projects);
  pendingImport = null;
  closeModal(importModal);
  render();
  showToast({ message: "Import successful." });
});

importReplaceButton?.addEventListener("click", () => {
  if (!pendingImport) {
    return;
  }
  projects = pendingImport;
  saveProjects(projects);
  logProjectCounts(projects);
  pendingImport = null;
  closeModal(importModal);
  render();
  showToast({ message: "Import successful." });
});

window.addEventListener("resize", () => {
  if (isMobile()) {
    showBackdrop(railBackdrop, mainContent?.dataset.railOpen === "true");
    showBackdrop(inspectorBackdrop, mainContent?.dataset.inspectorOpen === "true");
  } else {
    showBackdrop(railBackdrop, false);
    showBackdrop(inspectorBackdrop, false);
  if (activeTrap?.container === leftRail || activeTrap?.container === rightInspector) {
    deactivateFocusTrap();
  }
  }
  updateWorkspaceScrollCue();
});

canvasCenter?.addEventListener("scroll", updateWorkspaceScrollCue);

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const viewOption = button.dataset.viewOption;
    if (!viewOption) {
      return;
    }
    setView(viewOption);
    closeLeftRail({ restoreFocus: false });
  });
});

sortSelect?.addEventListener("change", (event) => {
  const nextMode = event.currentTarget.value;
  if (!SORT_MODES.includes(nextMode)) {
    return;
  }
  currentSortMode = nextMode;
  saveSortMode(nextMode);
  render();
});

const setNotesPhase = (phase, { focusTab = false } = {}) => {
  if (!VALID_PHASES.includes(phase)) {
    return;
  }
  inspectorNotesPhase = phase;
  renderInspector();
  if (focusTab) {
    const targetTab = notesTabButtons.find((button) => button.dataset.notesPhase === phase);
    targetTab?.focus();
  }
};

const syncInspectorPhaseAnchor = (phase) => {
  if (!phase || !inspectorPhaseAnchor) {
    return;
  }
  inspectorPhaseAnchor.dataset.phase = phase;
  inspectorPhaseAnchor.setAttribute("title", phase);
};

const handleNotesTabKeydown = (event) => {
  const currentIndex = notesTabButtons.indexOf(event.currentTarget);
  if (currentIndex === -1) {
    return;
  }
  const lastIndex = notesTabButtons.length - 1;
  let nextIndex = currentIndex;

  switch (event.key) {
    case "ArrowRight":
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
      break;
    case "ArrowLeft":
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = lastIndex;
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      setNotesPhase(event.currentTarget.dataset.notesPhase || "Idea");
      return;
    default:
      return;
  }

  event.preventDefault();
  const nextTab = notesTabButtons[nextIndex];
  if (nextTab) {
    setNotesPhase(nextTab.dataset.notesPhase || "Idea", { focusTab: true });
  }
};

notesTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setNotesPhase(button.dataset.notesPhase || "Idea");
  });
  button.addEventListener("keydown", handleNotesTabKeydown);
});

Array.from(rightInspector?.querySelectorAll("input, textarea, select") || []).forEach((field) => {
  field.addEventListener("focus", (event) => {
    if (isMobile()) {
      const scrollContainer = rightInspector?.querySelector(".right-inspector__body") || rightInspector;
      ensureVisibleInContainer(event.currentTarget, scrollContainer);
    }
  });
});

inspectorNameInput?.addEventListener("input", (event) => {
  const nextName = normalizeText(event.currentTarget.value);
  if (draftProject) {
    updateDraftProject({ name: nextName });
    return;
  }
  if (!selectedProjectId) {
    return;
  }
  applyProjectPatch(selectedProjectId, { name: nextName }, { skipRender: true });
});
inspectorNameInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && draftProject) {
    event.preventDefault();
    confirmDraftProject();
  }
});
inspectorNameInput?.addEventListener("blur", () => render());

inspectorOwnerInput?.addEventListener("input", (event) => {
  const nextOwner = normalizeText(event.currentTarget.value);
  if (draftProject) {
    updateDraftProject({ owner: nextOwner });
    return;
  }
  if (!selectedProjectId) {
    return;
  }
  applyProjectPatch(selectedProjectId, { owner: nextOwner }, { skipRender: true });
});
inspectorOwnerInput?.addEventListener("blur", () => render());

inspectorDueDateInput?.addEventListener("change", (event) => {
  const value = event.currentTarget.value;
  if (draftProject) {
    updateDraftProject({ dueDate: normalizeDueDate(value) });
    render();
    return;
  }
  if (!selectedProjectId) {
    return;
  }
  applyProjectPatch(selectedProjectId, { dueDate: normalizeDueDate(value) }, { skipRender: true });
  render();
});

inspectorClearDueDateButton?.addEventListener("click", () => {
  if (draftProject) {
    updateDraftProject({ dueDate: "" });
    render();
    return;
  }
  if (!selectedProjectId) {
    return;
  }
  applyProjectPatch(selectedProjectId, { dueDate: "" }, { skipRender: true });
  render();
});

notesTextareas.forEach((textarea) => {
  textarea.addEventListener("input", (event) => {
    const phase = event.currentTarget.dataset.notesPanel;
    if (!phase || !VALID_PHASES.includes(phase)) {
      return;
    }
    if (draftProject) {
      const nextNotes = {
        ...(draftProject.notesByPhase || {}),
        [phase]: event.currentTarget.value,
      };
      updateDraftProject({ notesByPhase: nextNotes });
      return;
    }
    if (!selectedProjectId) {
      return;
    }
    const project = projects.find((entry) => entry.id === selectedProjectId);
    if (!project) {
      return;
    }
    const nextNotes = {
      ...(project.notesByPhase || {}),
      [phase]: event.currentTarget.value,
    };
    applyProjectPatch(selectedProjectId, { notesByPhase: nextNotes }, { skipRender: true });
  });
  textarea.addEventListener("blur", () => render());
  textarea.addEventListener("focus", (event) => {
    if (isMobile()) {
      const scrollContainer = rightInspector?.querySelector(".right-inspector__body") || rightInspector;
      ensureVisibleInContainer(event.currentTarget, scrollContainer);
    }
  });
});

inspectorPhaseSelect?.addEventListener("change", (event) => {
  const nextPhase = event.currentTarget.value;
  if (!VALID_PHASES.includes(nextPhase)) {
    return;
  }
  syncInspectorPhaseAnchor(nextPhase);
  if (draftProject) {
    updateDraftProject({ phase: nextPhase });
    setNotesPhase(nextPhase);
    return;
  }
  if (!selectedProjectId) {
    return;
  }
  setNotesPhase(nextPhase);
  changeProjectPhase(selectedProjectId, nextPhase);
});

inspectorCloseButton?.addEventListener("click", () => {
  closeInspector();
  render();
});

inspectorCreateButton?.addEventListener("click", () => {
  confirmDraftProject();
});

inspectorAbandonButton?.addEventListener("click", handleAbandonClick);

createButton?.addEventListener("click", () => {
  ensureDashboardWorkspaceVisible();
  openDraftInspector(createButton);
});

const isEditableField = (element) => {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }
  const tag = element.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    element.isContentEditable ||
    element.getAttribute("role") === "textbox"
  );
};

document.addEventListener("keydown", (event) => {
  if (activeTrap) {
    if (event.key === "Escape") {
      event.preventDefault();
      activeTrap.onClose?.();
      return;
    }
    if (handleTrapKeydown(event)) {
      return;
    }
  }

  const inspectorOpen = mainContent?.dataset.inspectorOpen === "true";
  const hasSelectedProject = Boolean(selectedProjectId);
  if (inspectorOpen) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeInspector();
      render();
      return;
    }

    if (hasSelectedProject && !isEditableField(event.target)) {
      const shortcutMap = {
        "1": "Idea",
        "2": "Build",
        "3": "Fix",
        "4": "Done",
      };
      const mappedPhase = shortcutMap[event.key];
      if (mappedPhase) {
        event.preventDefault();
        setNotesPhase(mappedPhase);
        changeProjectPhase(selectedProjectId, mappedPhase);
        return;
      }
    }

    if (hasSelectedProject && (event.ctrlKey || event.metaKey) && event.key === "Enter") {
      if (!isEditableField(event.target)) {
        event.preventDefault();
        executePendingAction();
      }
      return;
    }
  }

  if (event.key === "Escape" && pendingAction) {
    event.preventDefault();
    cancelPendingAction();
    render();
    return;
  }

  if (
    event.shiftKey &&
    event.key.toLowerCase() === "n" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    if (isEditableField(event.target)) {
      return;
    }

    const modalOpen =
      (modalBackdrop && !modalBackdrop.hidden) ||
      (importModal && !importModal.hidden) ||
      (helpModal && !helpModal.hidden);
    if (modalOpen) {
      return;
    }

    event.preventDefault();
    if (draftProject) {
      requestAnimationFrame(() => {
        inspectorNameInput?.focus();
      });
      return;
    }

    ensureDashboardWorkspaceVisible();
    openDraftInspector(createButton);
    requestAnimationFrame(() => {
      inspectorNameInput?.focus();
    });
    return;
  }
});
