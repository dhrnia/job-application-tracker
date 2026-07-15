// ---------------------------------------------------------------------------
// Company model
// ---------------------------------------------------------------------------

class Company {
  constructor(data = {}) {
    this.id        = data.id        || crypto.randomUUID();
    this.name      = data.name      || "";
    this.website   = data.website   || "";
    this.industry  = data.industry  || "";
    this.location  = data.location  || "";
    this.notes     = data.notes     || "";
    this.createdAt = data.createdAt || new Date().toISOString();
  }
}
