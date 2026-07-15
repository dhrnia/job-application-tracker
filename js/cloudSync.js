// ===========================================================================
// cloudSync.js — JSONBin.io Cloud Synchronization
// ===========================================================================
//
// HOW TO ENABLE CLOUD SYNC (optional — the app works fully offline without it):
//
//   1. Go to https://jsonbin.io and create a FREE account.
//   2. On the dashboard, go to "API Keys" and copy your X-Master-Key.
//   3. Click "Create a Bin", paste this as the content:
//          { "initialized": true }
//      and save.  Copy the Bin ID from the URL or the dashboard.
//   4. Paste both values into CLOUD_CONFIG below.
//   5. That's it — refresh the tracker and the floating badge will
//      show "Synced" instead of "Cloud sync not configured".
//
// The free tier gives 10 000 requests / month — more than enough for
// personal use across multiple devices.
// ===========================================================================

const CLOUD_CONFIG = {
  // ┌──────────────────────────────────────────────────────────────────────┐
  // │  ⬇️  PASTE YOUR JSONBin.io CREDENTIALS HERE                        │
  // └──────────────────────────────────────────────────────────────────────┘
  apiKey: "$2a$10$HaqutheEv2jwKLw8D2CoheZwy1Jz.y2UA1k4AkLMcxuJt9bN0P3nu",
  binId:  "6a57b6adda38895dfe61ef4a",
  // ──────────────────────────────────────────────────────────────────────

  baseUrl:     "https://api.jsonbin.io/v3/b",
  debounceMs:  1500,
  keyPrefix:   "jobtracker_"
};

// Status labels shown in the floating indicator.
const SYNC_STATUS = {
  SYNCED:     "Synced",
  SYNCING:    "Syncing\u2026",       // ellipsis character
  OFFLINE:    "Offline",
  ERROR:      "Sync Failed",
  DISABLED:   "Cloud sync not configured"
};

// ---------------------------------------------------------------------------
// CloudSync class
// ---------------------------------------------------------------------------

class CloudSync {
  constructor() {
    /** @type {number|null} Debounce timer handle */
    this._timer = null;

    /** @type {boolean} True while a PUT is in-flight */
    this._pushing = false;

    /** @type {boolean} True if another push was requested mid-flight */
    this._pendingPush = false;

    /** @type {boolean} Browser connectivity state */
    this._online = navigator.onLine;

    /** @type {boolean} True when both apiKey and binId are filled in */
    this.isConfigured = !!(CLOUD_CONFIG.apiKey && CLOUD_CONFIG.binId);

    // --- Create the floating status indicator --------------------------------
    this._badge = this._createBadge();

    // --- Connectivity listeners ----------------------------------------------
    window.addEventListener("online", () => {
      this._online = true;
      this._setStatus(SYNC_STATUS.SYNCED);
      this.loadFromCloud();            // re-sync on reconnect
    });

    window.addEventListener("offline", () => {
      this._online = false;
      this._setStatus(SYNC_STATUS.OFFLINE);
    });

    // --- Show initial state --------------------------------------------------
    if (!this.isConfigured) {
      this._setStatus(SYNC_STATUS.DISABLED);
    } else if (!this._online) {
      this._setStatus(SYNC_STATUS.OFFLINE);
    } else {
      this._setStatus(SYNC_STATUS.SYNCED);
    }
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Fetch cloud data and write it into localStorage.
   * Called once on startup and again whenever the tab regains focus.
   *
   * @returns {Promise<boolean>} true on success, false on skip/failure.
   */
  async loadFromCloud() {
    if (!this.isConfigured || !this._online) return false;

    try {
      this._setStatus(SYNC_STATUS.SYNCING);

      const response = await fetch(
        `${CLOUD_CONFIG.baseUrl}/${CLOUD_CONFIG.binId}/latest`,
        { headers: this._headers() }
      );
      if (!response.ok) throw new Error(`GET ${response.status}`);

      const cloudData = await response.json();

      // Merge cloud → local for every jobtracker_* key.
      this._mergeCloudToLocal(cloudData);

      // Notify app.js (and any other listener) so it re-reads from
      // localStorage and re-renders the UI.
      window.dispatchEvent(new Event("cloudsyncupdated"));

      this._setStatus(SYNC_STATUS.SYNCED);
      return true;
    } catch (err) {
      console.warn("[CloudSync] loadFromCloud failed:", err);
      this._setStatus(SYNC_STATUS.ERROR);
      return false;
    }
  }

  /**
   * Schedule a debounced push to the cloud.
   * Every store.save*() call should invoke this.
   */
  schedulePush() {
    if (!this.isConfigured) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._pushToCloud(), CLOUD_CONFIG.debounceMs);
  }

  // ==========================================================================
  // Internal — push
  // ==========================================================================

  /** @private */
  async _pushToCloud() {
    if (!this._online) {
      this._setStatus(SYNC_STATUS.OFFLINE);
      return;
    }

    if (this._pushing) {
      this._pendingPush = true;
      return;
    }

    this._pushing = true;
    try {
      this._setStatus(SYNC_STATUS.SYNCING);

      // Collect every jobtracker_* key from localStorage into one object.
      const payload = this._collectLocalData();
      payload._lastSync = new Date().toISOString();

      const response = await fetch(
        `${CLOUD_CONFIG.baseUrl}/${CLOUD_CONFIG.binId}`,
        {
          method: "PUT",
          headers: {
            ...this._headers(),
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) throw new Error(`PUT ${response.status}`);

      this._setStatus(SYNC_STATUS.SYNCED);
    } catch (err) {
      console.warn("[CloudSync] pushToCloud failed:", err);
      this._setStatus(SYNC_STATUS.ERROR);
    } finally {
      this._pushing = false;
      if (this._pendingPush) {
        this._pendingPush = false;
        this._pushToCloud();
      }
    }
  }

  // ==========================================================================
  // Internal — merge helpers
  // ==========================================================================

  /**
   * Merge cloud data into localStorage.
   *
   * For collection keys (arrays) we merge by item `id`, keeping the
   * version with the newest `updatedAt` (or `createdAt` as fallback).
   * Items that exist only on one side are always preserved.
   *
   * For the settings key (plain object) the cloud version wins for any
   * key present in both, but local-only keys are kept.
   *
   * @private
   * @param {object} cloudData – The full bin contents from JSONBin.
   */
  _mergeCloudToLocal(cloudData) {
    if (!cloudData || typeof cloudData !== "object") return;

    const prefix = CLOUD_CONFIG.keyPrefix;

    for (const [key, cloudValue] of Object.entries(cloudData)) {
      // Only process our prefixed keys (skip _lastSync, initialized, etc.)
      if (!key.startsWith(prefix)) continue;

      const localRaw = localStorage.getItem(key);

      // --- Array collections: merge by id ------------------------------------
      if (Array.isArray(cloudValue)) {
        let localArr = [];
        try { localArr = JSON.parse(localRaw) || []; } catch { /* empty */ }
        if (!Array.isArray(localArr)) localArr = [];

        const merged = this._mergeArraysById(localArr, cloudValue);
        localStorage.setItem(key, JSON.stringify(merged));
        continue;
      }

      // --- Plain object (e.g. settings): shallow merge, cloud wins ----------
      if (typeof cloudValue === "object" && cloudValue !== null) {
        let localObj = {};
        try { localObj = JSON.parse(localRaw) || {}; } catch { /* empty */ }
        if (typeof localObj !== "object" || Array.isArray(localObj)) localObj = {};

        const merged = { ...localObj, ...cloudValue };
        localStorage.setItem(key, JSON.stringify(merged));
        continue;
      }

      // --- Primitive / unknown: cloud wins -----------------------------------
      localStorage.setItem(key, JSON.stringify(cloudValue));
    }
  }

  /**
   * Merge two arrays of objects by `id`.
   * When the same id exists in both, keep the version with the
   * newest updatedAt (or createdAt as fallback).
   *
   * @private
   * @param {object[]} localArr
   * @param {object[]} cloudArr
   * @returns {object[]}
   */
  _mergeArraysById(localArr, cloudArr) {
    const map = new Map();

    for (const item of localArr) {
      if (item?.id) map.set(item.id, item);
    }

    for (const item of cloudArr) {
      if (!item?.id) continue;
      const existing = map.get(item.id);
      if (!existing || this._timestamp(item) > this._timestamp(existing)) {
        map.set(item.id, item);
      }
    }

    return [...map.values()];
  }

  /** @private  Return epoch-ms for an item's last-modified time. */
  _timestamp(item) {
    return Date.parse(item.updatedAt || item.createdAt || 0) || 0;
  }

  // ==========================================================================
  // Internal — local data collection
  // ==========================================================================

  /**
   * Read every jobtracker_* key from localStorage and return them as
   * a single object keyed by the storage key name.
   *
   * @private
   * @returns {object}
   */
  _collectLocalData() {
    const data = {};
    const prefix = CLOUD_CONFIG.keyPrefix;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith(prefix)) continue;

      try {
        data[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        data[key] = localStorage.getItem(key);
      }
    }

    return data;
  }

  // ==========================================================================
  // Internal — request headers
  // ==========================================================================

  /** @private */
  _headers() {
    return {
      "X-Master-Key": CLOUD_CONFIG.apiKey,
      "X-Bin-Meta":   "false"
    };
  }

  // ==========================================================================
  // Internal — floating status badge
  // ==========================================================================

  /**
   * Create a small floating indicator in the bottom-right corner.
   * @private
   * @returns {HTMLElement}
   */
  _createBadge() {
    const badge = document.createElement("div");
    badge.id = "cloud-sync-badge";
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-live", "polite");

    // Inject scoped styles once.
    const style = document.createElement("style");
    style.textContent = `
      #cloud-sync-badge {
        position: fixed;
        bottom: 18px;
        right: 18px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid #d9e0e4;
        box-shadow: 0 4px 16px rgba(31,41,51,0.10);
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 700;
        color: #667085;
        transition: background 0.25s, color 0.25s, border-color 0.25s;
        pointer-events: none;
        user-select: none;
      }
      #cloud-sync-badge::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #44c76a;
        flex-shrink: 0;
        transition: background 0.25s;
      }
      #cloud-sync-badge[data-state="syncing"]::before { background: #f5a623; }
      #cloud-sync-badge[data-state="offline"]::before { background: #aab2bd; }
      #cloud-sync-badge[data-state="error"]::before   { background: #e74c3c; }
      #cloud-sync-badge[data-state="disabled"]::before { background: #aab2bd; }
      #cloud-sync-badge[data-state="error"] {
        color: #b42318;
        border-color: rgba(180,35,24,0.25);
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(badge);

    return badge;
  }

  /**
   * Update the floating badge text and visual state.
   * @private
   * @param {string} label  One of the SYNC_STATUS values.
   */
  _setStatus(label) {
    if (!this._badge) return;

    this._badge.textContent = label;

    // Map label → data-state for CSS styling.
    const stateMap = {
      [SYNC_STATUS.SYNCED]:   "synced",
      [SYNC_STATUS.SYNCING]:  "syncing",
      [SYNC_STATUS.OFFLINE]:  "offline",
      [SYNC_STATUS.ERROR]:    "error",
      [SYNC_STATUS.DISABLED]: "disabled"
    };
    this._badge.dataset.state = stateMap[label] || "synced";
  }
}

// ---------------------------------------------------------------------------
// Global singleton — available to store.js and app.js
// ---------------------------------------------------------------------------
const cloudSync = new CloudSync();
