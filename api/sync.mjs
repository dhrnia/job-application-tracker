const JSONBIN_BASE_URL = "https://api.jsonbin.io/v3/b";

export default {
  async fetch(request) {
    const jsonBinKey = process.env.JSONBIN_KEY;
    const jsonBinId = process.env.JSONBIN_BIN_ID;

    if (!jsonBinKey || !jsonBinId) {
      return Response.json(
        { error: "Cloud sync is not configured on this deployment." },
        { status: 503 }
      );
    }

    if (request.method === "GET") {
      const cloudResponse = await fetch(`${JSONBIN_BASE_URL}/${jsonBinId}/latest`, {
        headers: {
          "X-Master-Key": jsonBinKey,
          "X-Bin-Meta": "false"
        }
      });

      return new Response(await cloudResponse.text(), {
        status: cloudResponse.status,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    if (request.method === "PUT") {
      try {
        const data = await request.json();
        if (!Array.isArray(data.applications) || !isPlainObject(data.deletedApplications)) {
          return Response.json({ error: "Invalid tracker data." }, { status: 400 });
        }

        const cloudResponse = await fetch(`${JSONBIN_BASE_URL}/${jsonBinId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Master-Key": jsonBinKey
          },
          body: JSON.stringify({
            initialized: true,
            lastSync: new Date().toISOString(),
            applications: data.applications,
            deletedApplications: data.deletedApplications
          })
        });

        if (!cloudResponse.ok) {
          return Response.json({ error: "Cloud storage rejected the update." }, { status: 502 });
        }

        return Response.json({ synced: true });
      } catch {
        return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
      }
    }

    return new Response(null, { status: 405, headers: { Allow: "GET, PUT" } });
  }
};

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
