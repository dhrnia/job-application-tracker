// ---------------------------------------------------------------------------
// Application model
// ---------------------------------------------------------------------------
// Status values: saved, applied, phone_screen, interview, offer,
//                rejected, withdrawn, accepted
// ---------------------------------------------------------------------------

class Application {
  constructor(data = {}) {
    this.id            = data.id            || crypto.randomUUID();
    this.companyName   = data.companyName   || "";
    this.jobTitle      = data.jobTitle      || "";
    this.jobUrl        = data.jobUrl        || "";
    this.location      = data.location      || "";
    this.status        = data.status        || "saved";
    this.appliedDate   = data.appliedDate   || null;
    this.source        = data.source        || "";
    this.notes         = data.notes         || "";
    this.tags          = Array.isArray(data.tags) ? [...data.tags] : [];
    this.priority      = data.priority      || "medium";
    this.createdAt     = data.createdAt     || new Date().toISOString();
    this.updatedAt     = data.updatedAt     || new Date().toISOString();
  }
}
