const STORAGE_KEY = "projectPhaseTracker.projects.v1";
const SORT_STORAGE_KEY = "projectPhaseTracker.sortMode.v1";
const VALID_PHASES = ["Idea", "Build", "Fix", "Done"];
const PROJECT_LIMIT = 16;
const VIEW_STATES = ["dashboard", "completed", "abandoned"];
const SORT_MODES = ["lastUpdated", "createdAt", "dueDate", "phase"];
const PHASE_SORT_ORDER = ["Idea", "Build", "Fix", "Done"];

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

const pendingDoneIds = new Set();
const pendingDoneTimers = new Map();

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
    if (!Array.isArray(parsed)) {
      throw new Error("Payload is not an array");
    }

    return parsed.map(normalizeProject);
  } catch (error) {
    console.warn("[Project Phase Tracker] Failed to parse stored projects.", error);
    return [];
  }
};

const saveProjects = (projects) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (error) {
    console.warn("[Project Phase Tracker] Failed to save projects.", error);
  }
};

const loadSortMode = () => {
  const stored = localStorage.getItem(SORT_STORAGE_KEY);
  return SORT_MODES.includes(stored) ? stored : "lastUpdated";
};

const saveSortMode = (mode) => {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, mode);
  } catch (error) {
    console.warn("[Project Phase Tracker] Failed to save sort mode.", error);
  }
};

const isPendingDoneProject = (project) => pendingDoneIds.has(project.id);

const getCompletedProjects = (projects) =>
  projects.filter(
    (project) => project.status === "active" && project.phase === "Done" && !isPendingDoneProject(project)
  );

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

const scheduleDoneTransition = (projectId) => {
  clearDoneTransition(projectId);
  const timeoutId = setTimeout(() => {
    pendingDoneIds.delete(projectId);
    pendingDoneTimers.delete(projectId);
    render();
  }, 5000);
  pendingDoneTimers.set(projectId, timeoutId);
  pendingDoneIds.add(projectId);
};

const clearDoneTransition = (projectId) => {
  const timerId = pendingDoneTimers.get(projectId);
  if (timerId) {
    clearTimeout(timerId);
    pendingDoneTimers.delete(projectId);
  }
  pendingDoneIds.delete(projectId);
};

const changeProjectPhase = (projectId, nextPhase) => {
  if (!VALID_PHASES.includes(nextPhase)) {
    return null;
  }

  const now = getNowISO();
  let updatedProject = null;
  const nextProjects = projects.map((project) => {
    if (project.id !== projectId) {
      return project;
    }

    if (project.phase === nextPhase) {
      return project;
    }

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

  if (nextPhase === "Done" && updatedProject.status === "active") {
    scheduleDoneTransition(projectId);
  } else {
    clearDoneTransition(projectId);
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
  projects.filter(
    (project) => project.status === "active" && (project.phase !== "Done" || isPendingDoneProject(project))
  );

const canCreateNewProject = (projects) => getDashboardProjects(projects).length < PROJECT_LIMIT;

const createProject = ({
  name,
  phase,
  owner = "",
  notes = "",
  dueDate = "",
  lastUpdated,
} = {}) => {
  const now = getNowISO();
  const normalizedPhase = VALID_PHASES.includes(phase) ? phase : "Idea";

  return {
    id: generateId(),
    name: normalizeText(name) || `New Project ${new Date().toLocaleString()}`,
    phase: normalizedPhase,
    owner: normalizeText(owner),
    notesByPhase: buildNotesByPhase(normalizedPhase, null, normalizeText(notes)),
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

const projectsGrid = document.getElementById("projectsGrid");
const emptyState = document.getElementById("emptyState");
const emptyStateLabel = emptyState?.querySelector(".empty-state__label");
const emptyStateHint = emptyState?.querySelector(".empty-state__hint");
const capacityIndicator = document.getElementById("capacityIndicator");
const capacityFeedback = document.getElementById("capacityFeedback");
let capacityFeedbackTimer;
const mainContent = document.querySelector(".main-content");
const sortSelect = document.getElementById("sortSelect");
const viewButtons = Array.from(document.querySelectorAll("[data-view-option]"));
let currentView = "dashboard";
let currentSortMode = loadSortMode();
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

const rightInspector = document.querySelector(".right-inspector");
const inspectorNameInput = document.getElementById("inspectorName");
const inspectorOwnerInput = document.getElementById("inspectorOwner");
const inspectorPhaseSelect = document.getElementById("inspectorPhase");
const inspectorDueDateInput = document.getElementById("inspectorDueDate");
const inspectorClearDueDateButton = document.getElementById("inspectorClearDueDate");
const inspectorNotesTextarea = document.getElementById("inspectorNotes");
const inspectorHistoryList = document.getElementById("inspectorHistoryList");
const inspectorCreated = document.getElementById("inspectorCreated");
const inspectorUpdated = document.getElementById("inspectorUpdated");
const inspectorCloseButton = document.getElementById("inspectorClose");
const inspectorAbandonButton = document.getElementById("inspectorAbandon");
const inspectorAbandonConfirm = document.getElementById("inspectorAbandonConfirm");
const notesTabButtons = Array.from(document.querySelectorAll(".notes-tab"));
let selectedProjectId = null;
let inspectorNotesPhase = "Idea";
let pendingAction = null;

const updateCapacityIndicator = (activeCount) => {
  if (!capacityIndicator) {
    return;
  }

  capacityIndicator.textContent = `${activeCount} / ${PROJECT_LIMIT}`;
  capacityIndicator.dataset.full = activeCount >= PROJECT_LIMIT ? "true" : "false";
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

const render = () => {
  const dashboardProjects = getDashboardProjects(projects);
  updateCapacityIndicator(dashboardProjects.length);

  const visibleProjects = applySort(getProjectsForView(projects, currentView), currentSortMode);
  const stateCopy = EMPTY_STATE_COPY[currentView] || EMPTY_STATE_COPY.dashboard;

  if (emptyStateLabel) {
    emptyStateLabel.textContent = stateCopy.title;
  }

  if (emptyStateHint) {
    emptyStateHint.textContent = stateCopy.hint;
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
    if (project.id === selectedProjectId) {
      card.classList.add("is-selected");
    }
    card.addEventListener("click", () => openInspectorForProject(project.id));

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

  renderInspector();
};

const cancelPendingAction = () => {
  pendingAction = null;
  inspectorAbandonConfirm?.classList.remove("is-visible");
};

const openInspectorForProject = (projectId) => {
  const project = projects.find((item) => item.id === projectId);
  if (!project || !mainContent) {
    closeInspector();
    render();
    return;
  }

  selectedProjectId = projectId;
  inspectorNotesPhase = project.phase;
  mainContent.dataset.inspectorOpen = "true";
  clearDoneTransition(projectId);
  cancelPendingAction();
  render();
};

const closeInspector = () => {
  selectedProjectId = null;
  if (mainContent) {
    mainContent.dataset.inspectorOpen = "false";
  }
  cancelPendingAction();
};

const renderInspector = () => {
  if (!rightInspector || !selectedProjectId || mainContent?.dataset.inspectorOpen !== "true") {
    return;
  }

  const project = projects.find((item) => item.id === selectedProjectId);
  if (!project) {
    closeInspector();
    return;
  }

  if (inspectorNameInput) {
    inspectorNameInput.value = project.name;
  }
  if (inspectorOwnerInput) {
    inspectorOwnerInput.value = project.owner;
  }
  if (inspectorPhaseSelect) {
    inspectorPhaseSelect.value = project.phase;
  }
  if (inspectorDueDateInput) {
    inspectorDueDateInput.value = project.dueDate || "";
  }
  notesTabButtons.forEach((button) => {
    const phase = button.dataset.notesPhase;
    button.classList.toggle("is-active", phase === inspectorNotesPhase);
  });
  if (inspectorNotesTextarea) {
    inspectorNotesTextarea.value = project.notesByPhase?.[inspectorNotesPhase] || "";
  }

  if (inspectorHistoryList) {
    const history = Array.isArray(project.phaseHistory) ? project.phaseHistory.slice().reverse() : [];
    inspectorHistoryList.innerHTML = history
      .map((entry) => {
        const atLabel = entry.atISO ? new Date(entry.atISO).toLocaleString() : "Unknown";
        return `<li>${entry.from} → ${entry.to} · ${atLabel}</li>`;
      })
      .join("");
  }

  if (inspectorCreated) {
    inspectorCreated.textContent = new Date(project.createdAt).toLocaleDateString();
  }
  if (inspectorUpdated) {
    inspectorUpdated.textContent = formatRelativeTime(project.lastUpdated);
  }

  const mustConfirmAbandon = pendingAction?.type === "abandon" && pendingAction.projectId === project.id;
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
  clearDoneTransition(project.id);
  cancelPendingAction();
  closeInspector();
  render();
};

const performDeleteProject = (projectId) => {
  projects = projects.filter((project) => project.id !== projectId);
  clearDoneTransition(projectId);
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
  clearDoneTransition(projectId);
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

let projects = loadProjects();
logProjectCounts(projects);
syncViewUI();
if (sortSelect) {
  sortSelect.value = currentSortMode;
}
render();

const settingsButton = document.getElementById("btnSettings");
const createButton = document.getElementById("btnCreate");

const toggleLeftRail = () => {
  if (!mainContent) {
    return;
  }

  const isOpen = mainContent.dataset.railOpen === "true";
  const nextState = isOpen ? "false" : "true";
  mainContent.dataset.railOpen = nextState;
  settingsButton?.setAttribute("aria-pressed", nextState);
};

const closeLeftRail = () => {
  if (!mainContent) {
    return;
  }

  if (mainContent.dataset.railOpen === "true") {
    mainContent.dataset.railOpen = "false";
    settingsButton?.setAttribute("aria-pressed", "false");
  }
};

settingsButton?.addEventListener("click", () => {
  toggleLeftRail();
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const viewOption = button.dataset.viewOption;
    if (!viewOption) {
      return;
    }
    setView(viewOption);
    closeLeftRail();
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

notesTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    inspectorNotesPhase = button.dataset.notesPhase || "Idea";
    renderInspector();
  });
});

inspectorNameInput?.addEventListener("input", (event) => {
  if (!selectedProjectId) {
    return;
  }
  applyProjectPatch(
    selectedProjectId,
    { name: normalizeText(event.currentTarget.value) },
    { skipRender: true }
  );
});
inspectorNameInput?.addEventListener("blur", () => render());

inspectorOwnerInput?.addEventListener("input", (event) => {
  if (!selectedProjectId) {
    return;
  }
  applyProjectPatch(
    selectedProjectId,
    { owner: normalizeText(event.currentTarget.value) },
    { skipRender: true }
  );
});
inspectorOwnerInput?.addEventListener("blur", () => render());

inspectorDueDateInput?.addEventListener("change", (event) => {
  if (!selectedProjectId) {
    return;
  }
  const value = event.currentTarget.value;
  applyProjectPatch(selectedProjectId, { dueDate: normalizeDueDate(value) }, { skipRender: true });
  render();
});

inspectorClearDueDateButton?.addEventListener("click", () => {
  if (!selectedProjectId) {
    return;
  }
  applyProjectPatch(selectedProjectId, { dueDate: "" }, { skipRender: true });
  render();
});

inspectorNotesTextarea?.addEventListener("input", (event) => {
  if (!selectedProjectId) {
    return;
  }
  const project = projects.find((entry) => entry.id === selectedProjectId);
  if (!project) {
    return;
  }
  const nextNotes = {
    ...project.notesByPhase,
    [inspectorNotesPhase]: event.currentTarget.value,
  };
  applyProjectPatch(selectedProjectId, { notesByPhase: nextNotes }, { skipRender: true });
});
inspectorNotesTextarea?.addEventListener("blur", () => render());

inspectorPhaseSelect?.addEventListener("change", (event) => {
  if (!selectedProjectId) {
    return;
  }
  const nextPhase = event.currentTarget.value;
  inspectorNotesPhase = nextPhase;
  changeProjectPhase(selectedProjectId, nextPhase);
});

inspectorCloseButton?.addEventListener("click", () => {
  closeInspector();
  render();
});

inspectorAbandonButton?.addEventListener("click", handleAbandonClick);

createButton?.addEventListener("click", () => {
  console.log("create clicked");

  if (!canCreateNewProject(projects)) {
    showCapacityFeedback(`Maximum of ${PROJECT_LIMIT} active projects reached`);
    return;
  }

  const newProject = createProject({
    name: `New Project ${new Date().toLocaleString()}`,
  });

  projects = upsertProject(projects, newProject);
  saveProjects(projects);
  logProjectCounts(projects);
  render();
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
  const inspectorActive = mainContent?.dataset.inspectorOpen === "true" && Boolean(selectedProjectId);
  if (inspectorActive) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeInspector();
      render();
      return;
    }

    if (!isEditableField(event.target)) {
      const shortcutMap = {
        "1": "Idea",
        "2": "Build",
        "3": "Fix",
        "4": "Done",
      };
      const mappedPhase = shortcutMap[event.key];
      if (mappedPhase) {
        event.preventDefault();
        inspectorNotesPhase = mappedPhase;
        changeProjectPhase(selectedProjectId, mappedPhase);
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      if (!isEditableField(event.target)) {
        event.preventDefault();
        executePendingAction();
      }
      return;
    }
  }

  if (event.shiftKey && event.key.toLowerCase() === "n") {
    console.log("shortcut: new project");
  }
});
