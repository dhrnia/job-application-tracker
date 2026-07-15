// ===========================================================================
// app.js — Job Application Tracker UI
// ===========================================================================
// Depends on: store (global from js/store.js)
//             cloudSync (global from js/cloudSync.js)
// ===========================================================================

const password = "1703";
const unlockKey = "job-application-tracker-unlocked";

// --- DOM references ---------------------------------------------------------
const form           = document.querySelector("#applicationForm");
const applicationsEl = document.querySelector("#applications");
const template       = document.querySelector("#applicationTemplate");
const submitButton   = document.querySelector("#submitButton");
const cancelEdit     = document.querySelector("#cancelEdit");
const clearCompleted = document.querySelector("#clearCompleted");
const filters        = document.querySelectorAll(".filter-button");
const lockScreen     = document.querySelector("#lockScreen");
const lockForm       = document.querySelector("#lockForm");
const lockError      = document.querySelector("#lockError");
const passwordInput  = document.querySelector("#passwordInput");
const appShell       = document.querySelector("#appShell");
const saveStatus     = document.querySelector("#saveStatus");

// --- State ------------------------------------------------------------------
let applications  = store.getApplications();
let currentFilter = "All";

// --- Seed default data on first visit ---------------------------------------
if (applications.length === 0) {
  store.addApplication({
    company: "Northstar Labs",
    role:    "Frontend Developer",
    source:  "LinkedIn",
    rounds:  2,
    status:  "Interviewing",
    notes:   "Technical interview scheduled next week."
  });
  store.addApplication({
    company: "BrightPath",
    role:    "Product Engineer",
    source:  "Company website",
    rounds:  4,
    status:  "Offered",
    notes:   "Received offer. Compare with expected salary range."
  });
  applications = store.getApplications();
}

// --- Boot -------------------------------------------------------------------
initializeApp();

/**
 * Show the UI immediately from localStorage, then fetch cloud data in
 * the background.  The "cloudsyncupdated" event triggers a re-render
 * when the cloud merge finishes.
 */
async function initializeApp() {
  if (sessionStorage.getItem(unlockKey) === "true") {
    unlockApp();
  } else {
    passwordInput.focus();
  }

  // Non-blocking — failures are handled inside cloudSync.
  await cloudSync.loadFromCloud();
  applications = store.getApplications();
  render();
}

// --- Lock screen ------------------------------------------------------------
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

// --- Add / Edit form --------------------------------------------------------
form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData  = new FormData(form);
  const editingId = document.querySelector("#editingId").value;
  const timestamp = new Date().toISOString();

  const data = {
    company:   formData.get("company").trim(),
    role:      formData.get("role").trim(),
    source:    formData.get("source").trim(),
    rounds:    Number(formData.get("rounds")),
    status:    formData.get("status"),
    notes:     formData.get("notes").trim(),
    updatedAt: timestamp
  };

  if (editingId) {
    store.updateApplication(editingId, data);
  } else {
    data.createdAt = timestamp;
    store.addApplication(data);
  }

  applications = store.getApplications();
  setSaveStatus("Saved locally.");
  resetForm();
  render();
});

cancelEdit.addEventListener("click", resetForm);

// --- Clear closed (Rejected + Offered) --------------------------------------
clearCompleted.addEventListener("click", () => {
  const toRemove = applications.filter(
    (app) => ["Rejected", "Offered"].includes(app.status)
  );
  toRemove.forEach((app) => store.deleteApplication(app.id));

  applications = store.getApplications();
  setSaveStatus("Saved locally.");
  render();
});

// --- Filters ----------------------------------------------------------------
filters.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filters.forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    render();
  });
});

// --- Card actions (edit / delete) -------------------------------------------
applicationsEl.addEventListener("click", (event) => {
  const card = event.target.closest(".application-card");
  if (!card) return;

  const application = applications.find((item) => item.id === card.dataset.id);
  if (!application) return;

  if (event.target.matches(".delete-button")) {
    store.deleteApplication(application.id);
    applications = store.getApplications();
    setSaveStatus("Saved locally.");
    render();
  }

  if (event.target.matches(".edit-button")) {
    document.querySelector("#editingId").value = application.id;
    document.querySelector("#company").value   = application.company;
    document.querySelector("#role").value      = application.role;
    document.querySelector("#source").value    = application.source || "";
    document.querySelector("#rounds").value    = application.rounds;
    document.querySelector("#status").value    = application.status;
    document.querySelector("#notes").value     = application.notes;
    submitButton.textContent = "Save changes";
    cancelEdit.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

// --- Cloud sync listeners ---------------------------------------------------

/** After cloud data is merged into localStorage, re-read and re-render. */
window.addEventListener("cloudsyncupdated", () => {
  applications = store.getApplications();
  render();
});

/** Re-sync when the user switches back to this tab. */
window.addEventListener("focus", () => cloudSync.loadFromCloud());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") cloudSync.loadFromCloud();
});

// --- Render -----------------------------------------------------------------

function render() {
  const visible =
    currentFilter === "All"
      ? applications
      : applications.filter((app) => app.status === currentFilter);

  renderStats();
  applicationsEl.innerHTML = "";

  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No applications here yet.";
    applicationsEl.append(empty);
    return;
  }

  visible.forEach((application) => {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.id = application.id;
    card.querySelector("h3").textContent  = application.company;
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
  appShell.hidden   = false;
  render();
}

function renderStats() {
  document.querySelector("#totalCount").textContent        = applications.length;
  document.querySelector("#interviewingCount").textContent  = countStatus("Interviewing");
  document.querySelector("#offeredCount").textContent       = countStatus("Offered");
  document.querySelector("#rejectedCount").textContent      = countStatus("Rejected");
}

function countStatus(status) {
  return applications.filter((app) => app.status === status).length;
}

// --- Helpers ----------------------------------------------------------------

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
    day:   "numeric",
    year:  "numeric"
  }).format(new Date(dateString));
}
