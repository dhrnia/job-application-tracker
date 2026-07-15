// ---------------------------------------------------------------------------
// Interview model
// ---------------------------------------------------------------------------
// type: phone_screen | technical | behavioral | onsite | panel | take_home
// status: scheduled | completed | cancelled | no_show
// ---------------------------------------------------------------------------

class Interview {
  constructor(data = {}) {
    this.id              = data.id              || crypto.randomUUID();
    this.applicationId   = data.applicationId   || null;
    this.type            = data.type            || "phone_screen";
    this.dateTime        = data.dateTime        || null;
    this.location        = data.location        || "";
    this.interviewerName = data.interviewerName || "";
    this.status          = data.status          || "scheduled";
    this.prepNotes       = data.prepNotes       || "";
    this.feedback        = data.feedback        || "";
    this.createdAt       = data.createdAt       || new Date().toISOString();
  }
}
