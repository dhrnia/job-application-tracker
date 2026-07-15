# Job Application Tracker

Applications are stored immediately in this browser under `job-application-tracker`.

Optional JSONBin sync mirrors that data across devices. To enable it:

1. Create a JSONBin account and an empty bin containing `{ "initialized": true }`.
2. In `cloudSync.js`, add your own master key as `jsonBinKey` and the bin ID as `jsonBinId`.
3. Open the tracker from the same website address on each device. It downloads cloud data when it starts and uploads changes 1.5 seconds after the last edit.

The cloud key is powerful, so do not publish it in a public website or repository.
