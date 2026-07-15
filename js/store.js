// ===========================================================================
// store.js — localStorage data layer for the Job Application Tracker
// ===========================================================================
//
// Every domain (applications, companies, contacts, interviews, reminders)
// gets its own localStorage key with the prefix "jobtracker_".
//
// Public API per domain:
//   store.get<Domain>()              → Array of items
//   store.save<Domain>(items)        → void  (overwrites the whole array)
//   store.add<Domain>(data)          → newly created item
//   store.update<Domain>(id, data)   → updated item  (or null)
//   store.delete<Domain>(id)         → void
//
// Settings is a singleton object (not an array):
//   store.getSettings()              → settings object
//   store.saveSettings(obj)          → void
//
// Every save*() method writes to localStorage immediately and then calls
// cloudSync.schedulePush() (if available) so the change propagates to
// JSONBin within the 1.5 s debounce window.
//
// Depends on: models (Application, Company, Contact, Interview, Reminder)
//             cloudSync (global)
// ===========================================================================

class Store {
  constructor() {
    /** @type {string} localStorage key prefix */
    this.prefix = "jobtracker_";

    // Seed empty defaults for every domain so first reads always return
    // a valid structure even on a brand-new browser.
    this._seedDefaults();
  }

  // ==========================================================================
  // Applications
  // ==========================================================================

  /** @returns {Application[]} */
  getApplications() {
    return this._read("applications");
  }

  /** @param {Application[]} items */
  saveApplications(items) {
    this._write("applications", items);
  }

  /** @param {object} data  @returns {Application} */
  addApplication(data) {
    const item = new Application(data);
    const list = this.getApplications();
    list.unshift(item);
    this.saveApplications(list);
    return item;
  }

  /** @param {string} id  @param {object} updates  @returns {Application|null} */
  updateApplication(id, updates) {
    return this._updateItem("applications", id, updates);
  }

  /** @param {string} id */
  deleteApplication(id) {
    this._deleteItem("applications", id);
  }

  // ==========================================================================
  // Companies
  // ==========================================================================

  /** @returns {Company[]} */
  getCompanies() {
    return this._read("companies");
  }

  /** @param {Company[]} items */
  saveCompanies(items) {
    this._write("companies", items);
  }

  /** @param {object} data  @returns {Company} */
  addCompany(data) {
    const item = new Company(data);
    const list = this.getCompanies();
    list.unshift(item);
    this.saveCompanies(list);
    return item;
  }

  /** @param {string} id  @param {object} updates  @returns {Company|null} */
  updateCompany(id, updates) {
    return this._updateItem("companies", id, updates);
  }

  /** @param {string} id */
  deleteCompany(id) {
    this._deleteItem("companies", id);
  }

  // ==========================================================================
  // Contacts
  // ==========================================================================

  /** @returns {Contact[]} */
  getContacts() {
    return this._read("contacts");
  }

  /** @param {Contact[]} items */
  saveContacts(items) {
    this._write("contacts", items);
  }

  /** @param {object} data  @returns {Contact} */
  addContact(data) {
    const item = new Contact(data);
    const list = this.getContacts();
    list.unshift(item);
    this.saveContacts(list);
    return item;
  }

  /** @param {string} id  @param {object} updates  @returns {Contact|null} */
  updateContact(id, updates) {
    return this._updateItem("contacts", id, updates);
  }

  /** @param {string} id */
  deleteContact(id) {
    this._deleteItem("contacts", id);
  }

  // ==========================================================================
  // Interviews
  // ==========================================================================

  /** @returns {Interview[]} */
  getInterviews() {
    return this._read("interviews");
  }

  /** @param {Interview[]} items */
  saveInterviews(items) {
    this._write("interviews", items);
  }

  /** @param {object} data  @returns {Interview} */
  addInterview(data) {
    const item = new Interview(data);
    const list = this.getInterviews();
    list.unshift(item);
    this.saveInterviews(list);
    return item;
  }

  /** @param {string} id  @param {object} updates  @returns {Interview|null} */
  updateInterview(id, updates) {
    return this._updateItem("interviews", id, updates);
  }

  /** @param {string} id */
  deleteInterview(id) {
    this._deleteItem("interviews", id);
  }

  // ==========================================================================
  // Reminders
  // ==========================================================================

  /** @returns {Reminder[]} */
  getReminders() {
    return this._read("reminders");
  }

  /** @param {Reminder[]} items */
  saveReminders(items) {
    this._write("reminders", items);
  }

  /** @param {object} data  @returns {Reminder} */
  addReminder(data) {
    const item = new Reminder(data);
    const list = this.getReminders();
    list.unshift(item);
    this.saveReminders(list);
    return item;
  }

  /** @param {string} id  @param {object} updates  @returns {Reminder|null} */
  updateReminder(id, updates) {
    return this._updateItem("reminders", id, updates);
  }

  /** @param {string} id */
  deleteReminder(id) {
    this._deleteItem("reminders", id);
  }

  // ==========================================================================
  // Settings (singleton — not a collection)
  // ==========================================================================

  /** @returns {{ theme: string, defaultView: string, goalApplicationsPerWeek: number, currency: string }} */
  getSettings() {
    try {
      const raw = localStorage.getItem(this.prefix + "settings");
      const parsed = raw ? JSON.parse(raw) : null;
      return (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        ? parsed
        : this._defaultSettings();
    } catch {
      return this._defaultSettings();
    }
  }

  /** @param {object} settings */
  saveSettings(settings) {
    localStorage.setItem(this.prefix + "settings", JSON.stringify(settings));
    this._notifyCloud();
  }

  // ==========================================================================
  // Internal helpers
  // ==========================================================================

  /**
   * Read and parse a collection from localStorage.
   * @private
   * @param {string} domain  Key suffix (e.g. "applications")
   * @returns {object[]}
   */
  _read(domain) {
    try {
      const raw = localStorage.getItem(this.prefix + domain);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Write a collection to localStorage and schedule a cloud push.
   * @private
   * @param {string}   domain
   * @param {object[]} items
   */
  _write(domain, items) {
    localStorage.setItem(this.prefix + domain, JSON.stringify(items));
    this._notifyCloud();
  }

  /**
   * Generic update-by-id.  Merges `updates` into the existing item,
   * stamps a fresh `updatedAt`, and persists.
   *
   * @private
   * @param {string} domain
   * @param {string} id
   * @param {object} updates
   * @returns {object|null}  The updated item, or null if not found.
   */
  _updateItem(domain, id, updates) {
    const list = this._read(domain);
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) return null;

    const merged = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
    list[idx] = merged;
    this._write(domain, list);
    return merged;
  }

  /**
   * Generic delete-by-id.
   * Records a timestamped tombstone so the deletion survives cloud sync
   * (other devices won't re-introduce the item on their next push).
   * @private
   * @param {string} domain
   * @param {string} id
   */
  _deleteItem(domain, id) {
    this._recordTombstone(id);
    const list = this._read(domain).filter((item) => item.id !== id);
    this._write(domain, list);
  }

  /**
   * Record a deletion tombstone: { id: ISO-timestamp }.
   * CloudSync merges these across devices so a deleted item stays deleted.
   * @private
   * @param {string} id
   */
  _recordTombstone(id) {
    const key = this.prefix + "tombstones";
    let tombstones = {};
    try { tombstones = JSON.parse(localStorage.getItem(key) || "{}"); } catch { /* empty */ }
    tombstones[id] = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(tombstones));
  }

  /**
   * Tell cloudSync to schedule a push (if it's loaded and configured).
   * @private
   */
  _notifyCloud() {
    if (typeof cloudSync !== "undefined" && cloudSync.schedulePush) {
      cloudSync.schedulePush();
    }
  }

  // ==========================================================================
  // Defaults / seeding
  // ==========================================================================

  /** @private */
  _defaultSettings() {
    return {
      theme: "light",
      defaultView: "board",
      goalApplicationsPerWeek: 10,
      currency: "USD"
    };
  }

  /**
   * For every domain, if the key is missing in localStorage, write the
   * empty default so downstream code can always JSON.parse safely.
   * @private
   */
  _seedDefaults() {
    const collections = ["applications", "companies", "contacts", "interviews", "reminders"];

    for (const domain of collections) {
      const key = this.prefix + domain;
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, "[]");
      }
    }

    const settingsKey = this.prefix + "settings";
    if (localStorage.getItem(settingsKey) === null) {
      localStorage.setItem(settingsKey, JSON.stringify(this._defaultSettings()));
    }

    const tombstonesKey = this.prefix + "tombstones";
    if (localStorage.getItem(tombstonesKey) === null) {
      localStorage.setItem(tombstonesKey, "{}");
    }
  }
}

// ---------------------------------------------------------------------------
// Global singleton — available to app.js and the rest of the UI layer.
// ---------------------------------------------------------------------------
const store = new Store();
