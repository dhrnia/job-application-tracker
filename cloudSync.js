// ---------------------------------------------------------------------------
// cloudSync.js  –  Client-side cloud synchronization module
//
// Responsibilities:
//   1. Fetch cloud data from /api/sync (GET) on startup and tab-focus.
//   2. Push merged data to /api/sync (PUT) after local changes (debounced).
//   3. Merge applications by id, keeping the newest updatedAt version.
//   4. Synchronize deletions using timestamped tombstones so deleted
//      applications never reappear after syncing.
//   5. Display a clear sync status: Syncing… | Synced | Offline | Sync Failed.
//   6. Never block the UI — every network call is async and failures fall
//      back to local data without data loss.
// ---------------------------------------------------------------------------

const CLOUD_CONFIG = {
  apiUrl: "/api/sync",
  debounceMs: 1500
};

const APPLICATIONS_KEY = "job-application-tracker";
const DELETED_APPLICATIONS_KEY = "job-application-tracker-deleted";

// Sync status display strings (matched to the spec).
const STATUS = {
  SYNCING: "Syncing\u2026",
  SYNCED: "Synced",
  OFFLINE: "Offline",
  FAILED: "Sync Failed"
};

class CloudSync {
  constructor() {
    /** @type {number|null} Debounce timer handle */
    this.timer = null;

    /** @type {boolean} True while a push request is in-flight */
    this.isSyncing = false;

    /** @type {boolean} True if another push was requested during an in-flight push */
    this.pendingSync = false;

    /** @type {HTMLElement|null} The status element in the DOM */
    this.statusEl = document.querySelector("#syncStatus");

    // ---- Offline / Online detection ----------------------------------------
    // Track connectivity so we can show "Offline" immediately and avoid
    // pointless network calls that would always fail.
    this._online = navigator.onLine;

    window.addEventListener("online", () => {
      this._online = true;
      this.setStatus(STATUS.SYNCED, false);
      // Re-sync when we come back online to pick up any changes made while
      // offline on another device.
      this.loadFromCloud();
    });

    window.addEventListener("offline", () => {
      this._online = false;
      this.setStatus(STATUS.OFFLINE, false);
    });

    // Show initial state.
    if (!this._online) {
      this.setStatus(STATUS.OFFLINE, false);
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Fetch the latest cloud data and merge it with whatever is in
   * localStorage.  Dispatches a "clouddatachanged" CustomEvent so app.js
   * can re-render.
   *
   * Called on startup and whenever the browser tab regains focus.
   */
  async loadFromCloud() {
    if (!this._online) {
      this.setStatus(STATUS.OFFLINE, false);
      return false;
    }

    try {
      this.setStatus(STATUS.SYNCING, false);
      const cloudData = await this.fetchCloudData();
      const merged = this.mergeData(this.readLocalData(), cloudData);
      this.writeLocalData(merged);

      window.dispatchEvent(
        new CustomEvent("clouddatachanged", { detail: merged })
      );
      this.setStatus(STATUS.SYNCED, false);
      return true;
    } catch {
      this.setStatus(STATUS.FAILED, true);
      return false;
    }
  }

  /**
   * Schedule a debounced push to the cloud.  Called by app.js every time
   * local data changes (form submit, delete, clear closed).
   */
  schedulePush() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.pushToCloud(), CLOUD_CONFIG.debounceMs);
  }

  // --------------------------------------------------------------------------
  // Internal — Push
  // --------------------------------------------------------------------------

  /**
   * Push local data to the cloud.  Before uploading, fetches the latest
   * cloud copy and merges so we never overwrite changes made on another
   * device.
   */
  async pushToCloud() {
    if (!this._online) {
      this.setStatus(STATUS.OFFLINE, false);
      return;
    }

    // If a push is already in-flight, flag it so we retry after it finishes.
    if (this.isSyncing) {
      this.pendingSync = true;
      return;
    }

    this.isSyncing = true;
    try {
      this.setStatus(STATUS.SYNCING, false);

      // Step 1 — Fetch the latest cloud copy and merge with local data.
      const cloudData = await this.fetchCloudData();
      const merged = this.mergeData(this.readLocalData(), cloudData);
      this.writeLocalData(merged);

      // Step 2 — Upload the merged result.
      const response = await fetch(CLOUD_CONFIG.apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applications: merged.applications,
          deletedApplications: merged.deletedApplications
        })
      });

      if (!response.ok) throw new Error("Cloud upload failed");

      // Step 3 — Notify the app so the UI reflects the merged state.
      window.dispatchEvent(
        new CustomEvent("clouddatachanged", { detail: merged })
      );
      this.setStatus(STATUS.SYNCED, false);
    } catch {
      this.setStatus(STATUS.FAILED, true);
    } finally {
      this.isSyncing = false;

      // If another change arrived while we were syncing, retry now.
      if (this.pendingSync) {
        this.pendingSync = false;
        this.pushToCloud();
      }
    }
  }

  // --------------------------------------------------------------------------
  // Internal — Network
  // --------------------------------------------------------------------------

  /** Fetch the latest bin contents from the server-side proxy. */
  async fetchCloudData() {
    const response = await fetch(CLOUD_CONFIG.apiUrl);
    if (!response.ok) throw new Error("Cloud download failed");

    const data = await response.json();
    return {
      applications: Array.isArray(data?.applications) ? data.applications : [],
      deletedApplications: this.normalizeDeletedMap(data?.deletedApplications)
    };
  }

  // --------------------------------------------------------------------------
  // Internal — Local storage helpers
  // --------------------------------------------------------------------------

  /** Read applications and tombstones from localStorage. */
  readLocalData() {
    try {
      return {
        applications: JSON.parse(
          localStorage.getItem(APPLICATIONS_KEY) || "[]"
        ),
        deletedApplications: this.normalizeDeletedMap(
          JSON.parse(localStorage.getItem(DELETED_APPLICATIONS_KEY) || "{}")
        )
      };
    } catch {
      return { applications: [], deletedApplications: {} };
    }
  }

  /** Write the merged data set back to localStorage. */
  writeLocalData(data) {
    localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(data.applications));
    localStorage.setItem(
      DELETED_APPLICATIONS_KEY,
      JSON.stringify(data.deletedApplications)
    );
  }

  // --------------------------------------------------------------------------
  // Internal — Merge algorithm
  //
  //  • Union all applications by id.
  //  • For duplicate ids keep the version with the newest updatedAt
  //    (or createdAt as fallback).
  //  • Union all tombstones, keeping the latest timestamp per id.
  //  • Filter out any application whose modification timestamp is older
  //    than or equal to its tombstone — this means it was deleted after
  //    the last edit, so it should stay deleted.
  // --------------------------------------------------------------------------

  mergeData(local, remote) {
    // 1. Merge tombstones (deleted-application maps).
    const deletedApplications = this.mergeDeletedMaps(
      local.deletedApplications,
      remote.deletedApplications
    );

    // 2. Merge applications by id — newest updatedAt wins.
    const byId = new Map();
    const allApps = [...local.applications, ...remote.applications];

    for (const app of allApps) {
      if (!app?.id) continue;
      const existing = byId.get(app.id);
      if (!existing || this.modifiedAt(app) > this.modifiedAt(existing)) {
        byId.set(app.id, app);
      }
    }

    // 3. Remove applications that were deleted after their last edit.
    const applications = [...byId.values()]
      .filter(
        (app) =>
          this.modifiedAt(app) > this.deletedAt(deletedApplications[app.id])
      )
      .sort((a, b) => this.modifiedAt(b) - this.modifiedAt(a));

    return { applications, deletedApplications };
  }

  // --------------------------------------------------------------------------
  // Internal — Tombstone helpers
  // --------------------------------------------------------------------------

  /** Ensure the value is a plain { id: timestamp } object. */
  normalizeDeletedMap(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  /** Merge two tombstone maps, keeping the latest timestamp per id. */
  mergeDeletedMaps(mapA, mapB) {
    const merged = {};
    for (const map of [
      this.normalizeDeletedMap(mapA),
      this.normalizeDeletedMap(mapB)
    ]) {
      for (const [id, timestamp] of Object.entries(map)) {
        if (!merged[id] || this.deletedAt(timestamp) > this.deletedAt(merged[id])) {
          merged[id] = timestamp;
        }
      }
    }
    return merged;
  }

  // --------------------------------------------------------------------------
  // Internal — Timestamp helpers
  // --------------------------------------------------------------------------

  /** Return the effective modification epoch-ms for an application. */
  modifiedAt(app) {
    return Date.parse(app.updatedAt || app.createdAt || 0) || 0;
  }

  /** Return the epoch-ms for a tombstone timestamp string. */
  deletedAt(timestamp) {
    return Date.parse(timestamp || 0) || 0;
  }

  // --------------------------------------------------------------------------
  // Internal — UI status
  // --------------------------------------------------------------------------

  /**
   * Update the sync-status element with one of the four canonical states.
   * @param {string}  message  One of STATUS.SYNCING / SYNCED / OFFLINE / FAILED
   * @param {boolean} isError  Apply the error styling class
   */
  setStatus(message, isError = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle("error", isError);
  }
}

// Instantiate the singleton used by app.js.
const cloudSync = new CloudSync();
