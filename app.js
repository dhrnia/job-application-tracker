const storageKey = "job-application-tracker";
const deletedApplicationsKey = "job-application-tracker-deleted";
const password = "1703";
const unlockKey = "job-application-tracker-unlocked";

const defaultApplications = [
  {
    id: createId(),
    company: "Northstar Labs",
    role: "Frontend Developer",
    source: "LinkedIn",
    rounds: 2,
    status: "Interviewing",
    notes: "Technical interview scheduled next week.",
    createdAt: new Date().toISOString()
  },
  {
    id: createId(),
    company: "BrightPath",
    role: "Product Engineer",
    source: "Company website",
    rounds: 4,
    status: "Offered",
    notes: "Received offer. Compare with expected salary range.",
    createdAt: new Date().toISOString()
  }
];

const form = document.querySelector("#applicationForm");
const applicationsEl = document.querySelector("#applications");
const template = document.querySelector("#applicationTemplate");
const submitButton = document.querySelector("#submitButton");
const cancelEdit = document.querySelector("#cancelEdit");
const clearCompleted = document.querySelector("#clearCompleted");
const filters = document.querySelectorAll(".filter-button");
const lockScreen = document.querySelector("#lockScreen");
const lockForm = document.querySelector("#lockForm");
const lockError = document.querySelector("#lockError");
const passwordInput = document.querySelector("#passwordInput");
const appShell = document.querySelector("#appShell");
const saveStatus = document.querySelector("#saveStatus");
const syncStatus = document.querySelector("#syncStatus");

let applications = loadApplications();
let deletedApplications = loadDeletedApplications();
let currentFilter = "All";

initializeApp();

/**
 * Initialise the app.  Local data is loaded synchronously so the UI is
 * ready instantly; cloud data is fetched in the background and merged
 * when it arrives (the "clouddatachanged" event triggers a re-render).
 */
async function initializeApp() {
  if (sessionStorage.getItem(unlockKey) === "true") {
    unlockApp();
  } else {
    passwordInput.focus();
  }

  // Non-blocking cloud fetch — failures are handled inside cloudSync.
  await cloudSync.loadFromCloud();
  applications = loadApplications();
  deletedApplications = loadDeletedApplications();
  render();
}

lockForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (passwordInput.value === password) {
    sessionStorage.setItem(unlockKey, "true");
    unlockApp();
    return;
  }

  lockError.hidden = false;
  passwordInput.value = "";
  passwordInput.focus();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const editingId = document.querySelector("#editingId").value;
  const existingApplication = applications.find((item) => item.id === editingId);
  const timestamp = new Date().toISOString();
  const application = {
    id: editingId || createId(),
    company: formData.get("company").trim(),
    role: formData.get("role").trim(),
    source: formData.get("source").trim(),
    rounds: Number(formData.get("rounds")),
    status: formData.get("status"),
    notes: formData.get("notes").trim(),
    createdAt: existingApplication?.createdAt || timestamp,
    updatedAt: timestamp
  };

  delete deletedApplications[application.id];

  if (editingId) {
    applications = applications.map((item) => (item.id === editingId ? application : item));
  } else {
    applications = [application, ...applications];
  }

  saveApplications();
  resetForm();
  render();
});

cancelEdit.addEventListener("click", resetForm);

clearCompleted.addEventListener("click", () => {
  const removedApplications = applications.filter(
    (application) => ["Rejected", "Offered"].includes(application.status)
  );
  removedApplications.forEach((application) => {
    deletedApplications[application.id] = new Date().toISOString();
  });
  applications = applications.filter(
    (application) => !["Rejected", "Offered"].includes(application.status)
  );
  saveApplications();
  render();
});

filters.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filters.forEach((filterButton) => filterButton.classList.remove("active"));
    button.classList.add("active");
    render();
  });
});

applicationsEl.addEventListener("click", (event) => {
  const card = event.target.closest(".application-card");
  if (!card) return;

  const application = applications.find((item) => item.id === card.dataset.id);
  if (!application) return;

  if (event.target.matches(".delete-button")) {
    deletedApplications[application.id] = new Date().toISOString();
    applications = applications.filter((item) => item.id !== application.id);
    saveApplications();
    render();
  }

  if (event.target.matches(".edit-button")) {
    document.querySelector("#editingId").value = application.id;
    document.querySelector("#company").value = application.company;
    document.querySelector("#role").value = application.role;
    document.querySelector("#source").value = application.source || "";
    document.querySelector("#rounds").value = application.rounds;
    document.querySelector("#status").value = application.status;
    document.querySelector("#notes").value = application.notes;
    submitButton.textContent = "Save changes";
    cancelEdit.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

function render() {
  const visibleApplications =
    currentFilter === "All"
      ? applications
      : applications.filter((application) => application.status === currentFilter);

  renderStats();
  applicationsEl.innerHTML = "";

  if (visibleApplications.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No applications here yet.";
    applicationsEl.append(empty);
    return;
  }

  visibleApplications.forEach((application) => {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.id = application.id;
    card.querySelector("h3").textContent = application.company;
    card.querySelector(".role").textContent = application.role;
    card.querySelector(".rounds").textContent = `${application.rounds} round${
      application.rounds === 1 ? "" : "s"
    } reached`;
    card.querySelector(".source").textContent = application.source
      ? `Via ${application.source}`
      : "Source not recorded";
    card.querySelector(".date").textContent = formatDate(application.createdAt);
    card.querySelector(".notes").textContent = application.notes || "No notes added.";

    const pill = card.querySelector(".status-pill");
    pill.textContent = application.status;
    pill.classList.add(application.status.toLowerCase());

    applicationsEl.append(card);
  });
}

function unlockApp() {
  lockScreen.hidden = true;
  appShell.hidden = false;
  render();
}

function renderStats() {
  document.querySelector("#totalCount").textContent = applications.length;
  document.querySelector("#interviewingCount").textContent = countStatus("Interviewing");
  document.querySelector("#offeredCount").textContent = countStatus("Offered");
  document.querySelector("#rejectedCount").textContent = countStatus("Rejected");
}

function countStatus(status) {
  return applications.filter((application) => application.status === status).length;
}

function loadApplications() {
  try {
    const saved = localStorage.getItem(storageKey);
    const parsed = saved ? JSON.parse(saved) : null;
    if (Array.isArray(parsed)) return parsed;

    localStorage.setItem(storageKey, JSON.stringify(defaultApplications));
    return defaultApplications;
  } catch {
    return defaultApplications;
  }
}

function saveApplications() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(applications));
    localStorage.setItem(deletedApplicationsKey, JSON.stringify(deletedApplications));
    cloudSync.schedulePush();
    setSaveStatus("Saved locally.");
    return true;
  } catch {
    setSaveStatus("Your browser is blocking local storage. Open this tracker outside private browsing and try again.", true);
    return false;
  }
}

function loadDeletedApplications() {
  try {
    const saved = JSON.parse(localStorage.getItem(deletedApplicationsKey) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

/**
 * When cloudSync merges remote + local data it fires this custom event.
 * We update the in-memory arrays and re-render so the user sees any new
 * or updated applications from other devices.
 */
window.addEventListener("clouddatachanged", (event) => {
  applications = event.detail.applications;
  deletedApplications = event.detail.deletedApplications;
  render();
});

window.addEventListener("focus", () => cloudSync.loadFromCloud());

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") cloudSync.loadFromCloud();
});

function setSaveStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.classList.toggle("error", isError);
}

function resetForm() {
  form.reset();
  document.querySelector("#editingId").value = "";
  document.querySelector("#rounds").value = 0;
  submitButton.textContent = "Add application";
  cancelEdit.hidden = true;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(dateString));
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
