// ---------------------------------------------------------------------------
// /api/sync  –  Vercel Edge Function
//
// Proxies GET and PUT requests to JSONBin so the browser never sees the
// API key.  Environment variables JSONBIN_KEY and JSONBIN_BIN_ID must be
// set in the Vercel project settings.
// ---------------------------------------------------------------------------

export const config = { runtime: "edge" };

const JSONBIN_BASE = "https://api.jsonbin.io/v3/b";

// Shared response headers (JSON content-type + permissive CORS for the
// same-origin frontend — Vercel already scopes this to the deployment URL).
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

// ---- Helpers ---------------------------------------------------------------

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ---- Handler ---------------------------------------------------------------

export default async function handler(request) {
  const jsonBinKey = process.env.JSONBIN_KEY;
  const jsonBinId = process.env.JSONBIN_BIN_ID;

  // --- Pre-flight -----------------------------------------------------------
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  // --- Not configured -------------------------------------------------------
  if (!jsonBinKey || !jsonBinId) {
    return jsonResponse(
      { error: "Cloud sync is not configured on this deployment." },
      503
    );
  }

  // --- GET – fetch the latest bin contents ----------------------------------
  if (request.method === "GET") {
    try {
      const upstream = await fetch(`${JSONBIN_BASE}/${jsonBinId}/latest`, {
        headers: {
          "X-Master-Key": jsonBinKey,
          "X-Bin-Meta": "false"
        }
      });

      // Forward the upstream body & status to the client.
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: JSON_HEADERS
      });
    } catch {
      return jsonResponse({ error: "Failed to reach cloud storage." }, 502);
    }
  }

  // --- PUT – overwrite the bin with merged data -----------------------------
  if (request.method === "PUT") {
    let data;
    try {
      data = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON request body." }, 400);
    }

    if (!Array.isArray(data.applications) || !isPlainObject(data.deletedApplications)) {
      return jsonResponse({ error: "Invalid tracker data." }, 400);
    }

    try {
      const upstream = await fetch(`${JSONBIN_BASE}/${jsonBinId}`, {
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

      if (!upstream.ok) {
        return jsonResponse({ error: "Cloud storage rejected the update." }, 502);
      }

      return jsonResponse({ synced: true });
    } catch {
      return jsonResponse({ error: "Failed to reach cloud storage." }, 502);
    }
  }

  // --- Unsupported method ---------------------------------------------------
  return new Response(null, {
    status: 405,
    headers: { ...JSON_HEADERS, Allow: "GET, PUT, OPTIONS" }
  });
}
