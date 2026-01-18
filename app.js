const STORAGE_KEY = "projectPhaseTracker.projects.v1";
const VALID_PHASES = ["Idea", "Build", "Fix", "Done"];
const PROJECT_LIMIT = 16;
const VIEW_STATES = ["dashboard", "completed", "abandoned"];

const sortByRecency = (entries) =>
  [...entries].sort(
    (a, b) =>
      Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );

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
  const notes = normalizeText(record.notes);
  const status = record.status === "abandoned" ? "abandoned" : "active";
  const createdAt = record.createdAt ? toISO(record.createdAt) : getNowISO();
  const lastUpdated = record.lastUpdated ? toISO(record.lastUpdated) : createdAt;

  return {
    id,
    name,
    phase,
    owner,
    notes,
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

const getActiveProjects = (projects) => sortByRecency(projects.filter((project) => project.status === "active"));

const getCompletedProjects = (projects) =>
  sortByRecency(
    projects.filter((project) => project.status === "active" && project.phase === "Done")
  );

const getAbandonedProjects = (projects) =>
  sortByRecency(projects.filter((project) => project.status === "abandoned"));

const getProjectsForView = (projects, view) => {
  switch (view) {
    case "completed":
      return getCompletedProjects(projects);
    case "abandoned":
      return getAbandonedProjects(projects);
    default:
      return getActiveProjects(projects);
  }
};

const getDashboardProjects = (projects) =>
  sortByRecency(projects.filter((project) => project.status === "active" && project.phase !== "Done"));

const canCreateNewProject = (projects) => getDashboardProjects(projects).length < PROJECT_LIMIT;

const createProject = ({
  name,
  phase,
  owner = "",
  notes = "",
  lastUpdated,
} = {}) => {
  const now = getNowISO();

  return {
    id: generateId(),
    name: normalizeText(name) || `New Project ${new Date().toLocaleString()}`,
    phase: VALID_PHASES.includes(phase) ? phase : "Idea",
    owner: normalizeText(owner),
    notes: normalizeText(notes),
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

const setProjectPhase = (projects, id, nextPhase) => {
  if (!VALID_PHASES.includes(nextPhase)) {
    return projects;
  }

  return projects.map((project) => {
    if (project.id !== id) {
      return project;
    }

    return {
      ...project,
      phase: nextPhase,
      lastUpdated: getNowISO(),
    };
  });
};

const abandonProject = (projects, id) =>
  projects.map((project) =>
    project.id !== id
      ? project
      : {
          ...project,
          status: "abandoned",
          lastUpdated: getNowISO(),
        }
  );

const projectsGrid = document.getElementById("projectsGrid");
const emptyState = document.getElementById("emptyState");
const capacityIndicator = document.getElementById("capacityIndicator");
const capacityFeedback = document.getElementById("capacityFeedback");
let capacityFeedbackTimer;
const mainContent = document.querySelector(".main-content");
const viewButtons = Array.from(document.querySelectorAll("[data-view-option]"));
let currentView = "dashboard";

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

  const visibleProjects = getProjectsForView(projects, currentView);

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
    card.addEventListener("click", () => {
      console.log("open project", project.id);
    });

    const header = document.createElement("div");
    header.className = "project-card__header";

    const title = document.createElement("p");
    title.className = "project-card__title";
    title.textContent = project.name;

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
      const nextPhase = selectElement.value;
      projects = setProjectPhase(projects, project.id, nextPhase);
      saveProjects(projects);
      render();
    });

    header.append(title, phaseSelect);
    card.appendChild(header);

    if (project.owner) {
      const owner = document.createElement("p");
      owner.className = "project-card__owner";
      owner.textContent = `Owner: ${project.owner}`;
      card.appendChild(owner);
    }

    const meta = document.createElement("p");
    meta.className = "project-card__meta";
    meta.textContent = `Updated ${formatRelativeTime(project.lastUpdated)}`;
    card.appendChild(meta);

    projectsGrid.appendChild(card);
  });
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
  });
});

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

document.addEventListener("keydown", (event) => {
  if (event.shiftKey && event.key.toLowerCase() === "n") {
    console.log("shortcut: new project");
  }
});
