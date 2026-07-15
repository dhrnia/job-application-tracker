// ---------------------------------------------------------------------------
// Reminder model
// ---------------------------------------------------------------------------
// type: follow_up | interview_prep | thank_you | deadline | custom
// ---------------------------------------------------------------------------

class Reminder {
  constructor(data = {}) {
    this.id            = data.id            || crypto.randomUUID();
    this.applicationId = data.applicationId || null;
    this.title         = data.title         || "";
    this.dueDate       = data.dueDate       || null;
    this.isCompleted   = data.isCompleted   || false;
    this.type          = data.type          || "follow_up";
    this.createdAt     = data.createdAt     || new Date().toISOString();
  }
}
