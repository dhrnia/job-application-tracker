const CLOUD_CONFIG = {
  jsonBinKey: "",
  jsonBinId: "",
  baseUrl: "https://api.jsonbin.io/v3/b",
  debounceMs: 1500
};

class CloudSync {
  constructor() {
    this.timer = null;
    this.isSyncing = false;
    this.pendingSync = false;
    this.statusEl = document.querySelector("#syncStatus");
    this.isConfigured = Boolean(CLOUD_CONFIG.jsonBinKey && CLOUD_CONFIG.jsonBinId);
    this.setStatus(this.isConfigured ? "Cloud sync ready." : "Cloud sync is not configured.");
  }

  async loadFromCloud() {
    if (!this.isConfigured) return false;

    try {
      this.setStatus("Downloading cloud data…");
      const response = await fetch(`${CLOUD_CONFIG.baseUrl}/${CLOUD_CONFIG.jsonBinId}/latest`, {
        headers: {
          "X-Master-Key": CLOUD_CONFIG.jsonBinKey,
          "X-Bin-Meta": "false"
        }
      });
      if (!response.ok) throw new Error("Cloud download failed");

      const data = await response.json();
      if (data?.initialized && Array.isArray(data.applications)) {
        localStorage.setItem("job-application-tracker", JSON.stringify(data.applications));
      }

      this.setStatus("Cloud data synced.");
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
      this.setStatus("Uploading cloud data…");
      const payload = {
        initialized: true,
        lastSync: new Date().toISOString(),
        applications: JSON.parse(localStorage.getItem("job-application-tracker") || "[]")
      };
      const response = await fetch(`${CLOUD_CONFIG.baseUrl}/${CLOUD_CONFIG.jsonBinId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": CLOUD_CONFIG.jsonBinKey
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Cloud upload failed");

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

  setStatus(message, isError = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle("error", isError);
  }
}

const cloudSync = new CloudSync();
