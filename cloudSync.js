const CLOUD_CONFIG = {
  apiUrl: "/api/sync",
  debounceMs: 1500
};

const APPLICATIONS_KEY = "job-application-tracker";
const DELETED_APPLICATIONS_KEY = "job-application-tracker-deleted";

class CloudSync {
  constructor() {
    this.timer = null;
    this.isSyncing = false;
    this.pendingSync = false;
    this.statusEl = document.querySelector("#syncStatus");
    this.isConfigured = true;
    this.setStatus("Cloud sync ready.");
  }

  async loadFromCloud() {
    if (!this.isConfigured) return false;

    try {
      this.setStatus("Downloading cloud data…");
      const cloudData = await this.fetchCloudData();
      const merged = this.mergeData(this.readLocalData(), cloudData);
      this.writeLocalData(merged);
      window.dispatchEvent(new CustomEvent("clouddatachanged", { detail: merged }));
      this.setStatus("Cloud data merged.");
      return true;
    } catch {
      this.setStatus("Cloud sync error. Your local data is still available.", true);
      return false;
    }
  }

  schedulePush() {
    if (!this.isConfigured) return;

    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.pushToCloud(), CLOUD_CONFIG.debounceMs);
  }

  async pushToCloud() {
    if (this.isSyncing) {
      this.pendingSync = true;
      return;
    }

    this.isSyncing = true;
    try {
      this.setStatus("Merging cloud data…");
      const merged = this.mergeData(this.readLocalData(), await this.fetchCloudData());
      this.writeLocalData(merged);

      const response = await fetch(CLOUD_CONFIG.apiUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          applications: merged.applications,
          deletedApplications: merged.deletedApplications
        })
      });
      if (!response.ok) throw new Error("Cloud upload failed");

      window.dispatchEvent(new CustomEvent("clouddatachanged", { detail: merged }));
      this.setStatus("Cloud data synced.");
    } catch {
      this.setStatus("Cloud sync error. Your local data is still available.", true);
    } finally {
      this.isSyncing = false;
      if (this.pendingSync) {
        this.pendingSync = false;
        this.pushToCloud();
      }
    }
  }

  async fetchCloudData() {
    const response = await fetch(CLOUD_CONFIG.apiUrl);
    if (!response.ok) throw new Error("Cloud download failed");

    const data = await response.json();
    return {
      applications: Array.isArray(data?.applications) ? data.applications : [],
      deletedApplications: this.normalizeDeletedApplications(data?.deletedApplications)
    };
  }

  readLocalData() {
    try {
      return {
        applications: JSON.parse(localStorage.getItem(APPLICATIONS_KEY) || "[]"),
        deletedApplications: this.normalizeDeletedApplications(
          JSON.parse(localStorage.getItem(DELETED_APPLICATIONS_KEY) || "{}")
        )
      };
    } catch {
      return { applications: [], deletedApplications: {} };
    }
  }

  writeLocalData(data) {
    localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(data.applications));
    localStorage.setItem(DELETED_APPLICATIONS_KEY, JSON.stringify(data.deletedApplications));
  }

  mergeData(local, remote) {
    const deletedApplications = this.mergeDeletedApplications(
      local.deletedApplications,
      remote.deletedApplications
    );
    const applicationsById = new Map();

    [...local.applications, ...remote.applications].forEach((application) => {
      if (!application?.id) return;
      const existing = applicationsById.get(application.id);
      if (!existing || this.modifiedAt(application) > this.modifiedAt(existing)) {
        applicationsById.set(application.id, application);
      }
    });

    const applications = [...applicationsById.values()]
      .filter((application) => this.modifiedAt(application) > this.deletedAt(deletedApplications[application.id]))
      .sort((first, second) => this.modifiedAt(second) - this.modifiedAt(first));

    return { applications, deletedApplications };
  }

  normalizeDeletedApplications(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  mergeDeletedApplications(localDeletedApplications, remoteDeletedApplications) {
    const merged = {};
    [localDeletedApplications, remoteDeletedApplications].forEach((deletedApplications) => {
      Object.entries(this.normalizeDeletedApplications(deletedApplications)).forEach(([id, timestamp]) => {
        if (!merged[id] || this.deletedAt(timestamp) > this.deletedAt(merged[id])) {
          merged[id] = timestamp;
        }
      });
    });
    return merged;
  }

  modifiedAt(application) {
    return Date.parse(application.updatedAt || application.createdAt || 0) || 0;
  }

  deletedAt(timestamp) {
    return Date.parse(timestamp || 0) || 0;
  }

  setStatus(message, isError = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle("error", isError);
  }
}

const cloudSync = new CloudSync();
