# Job Application Tracker

A privacy-gated job application tracker that stores data in the browser's
`localStorage` (key: `job-application-tracker`) so it works instantly and
fully offline.  Optional cloud synchronization mirrors that data across
devices via a server-side `/api/sync` endpoint backed by JSONBin.

---

## Quick start (local only)

Open `index.html` in any browser.  No build step, no server required.
All data lives in `localStorage` and persists across sessions.

---

## Enabling cloud sync (multi-device)

Cloud sync keeps applications in-sync across browsers / devices.  The
JSONBin API key is **never** sent to the browser — it stays on the server.

### 1. Create a JSONBin bin

1. Sign up at [jsonbin.io](https://jsonbin.io) and copy your
   **X-Master-Key** from the API Keys page.
2. Create a new bin with this initial content:

   ```json
   { "initialized": true }
   ```

3. Copy the **Bin ID** from the bin URL (e.g. `64a1b2c3d4e5f6a7b8c9d0e1`).

### 2. Set environment variables in Vercel

In your Vercel project go to **Settings → Environment Variables** and add:

| Variable        | Value                           | Environments             |
| --------------- | ------------------------------- | ------------------------ |
| `JSONBIN_KEY`   | Your JSONBin X-Master-Key       | Production (and Preview) |
| `JSONBIN_BIN_ID`| The Bin ID you copied           | Production (and Preview) |

### 3. Redeploy

After adding the variables, trigger a new deployment so the edge function
picks them up:

```bash
vercel --prod
# or push a commit — Vercel auto-deploys on push
```

### 4. Use it

Open the same deployed URL on each device.  The tracker:

- **Downloads** cloud data on startup and whenever the tab regains focus.
- **Uploads** changes 1.5 seconds after the last local edit (debounced).
- **Merges** by application `id` — applications created on different
  devices are preserved; concurrent edits resolve by newest `updatedAt`.
- **Synchronizes deletions** with timestamped tombstones so a deleted
  application never reappears after syncing.

A sync status indicator below the form shows the current state:

| Status        | Meaning                                      |
| ------------- | -------------------------------------------- |
| Syncing…      | A cloud request is in-flight                 |
| Synced        | Local and cloud data are in agreement        |
| Offline       | No network — changes are saved locally       |
| Sync Failed   | Cloud request failed — local data is safe    |

---

## Two-device scenario

1. **Device A** creates "Company X" → after 1.5 s it syncs to the cloud.
2. **Device B** opens the tracker (or focuses the tab) → "Company X"
   appears.
3. Both devices edit "Company X" — the version with the newest
   `updatedAt` timestamp wins on the next sync.
4. **Device A** deletes "Company X" → the tombstone syncs to the cloud →
   "Company X" stays deleted on Device B.

---

## Security note

The PIN lock screen is a **browser privacy gate**, not secure user
authentication.  Anyone with access to the Vercel deployment URL and the
PIN can view the data.
