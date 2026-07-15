# Job Application Tracker

Applications are stored immediately in this browser under `job-application-tracker`.

Optional JSONBin sync mirrors that data across devices. The deployed Vercel app calls its own `/api/sync` function, which keeps the JSONBin credentials off the client. To enable it:

1. Create a JSONBin account and an empty bin containing `{ "initialized": true }`.
2. In Vercel Project Settings → Environment Variables, add `JSONBIN_KEY` and `JSONBIN_BIN_ID` for Production (and Preview if you use preview deployments).
3. Redeploy the project after setting the variables.
4. Open the same deployed tracker URL on each device. It downloads cloud data when it starts and uploads changes 1.5 seconds after the last edit.

The JSONBin key is never sent to the browser. The app's PIN remains a browser privacy gate, not secure user authentication.
