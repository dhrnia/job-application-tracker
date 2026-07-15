// ---------------------------------------------------------------------------
// Contact model
// ---------------------------------------------------------------------------

class Contact {
  constructor(data = {}) {
    this.id          = data.id          || crypto.randomUUID();
    this.name        = data.name        || "";
    this.email       = data.email       || "";
    this.role        = data.role        || "";
    this.companyId   = data.companyId   || null;
    this.linkedinUrl = data.linkedinUrl || "";
    this.notes       = data.notes       || "";
    this.createdAt   = data.createdAt   || new Date().toISOString();
  }
}
