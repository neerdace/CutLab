export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("CutLab API is running!", {
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }

    if (url.pathname === "/api/health") {
      return Response.json({
        success: true,
        message: "CutLab Worker is running"
      });
    }

    if (url.pathname === "/api/db-test") {
      try {
        const result = await env.DB
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all();

        return Response.json({
          success: true,
          database: "cutlab-db",
          tables: result.results
        });
      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }

    return Response.json(
      {
        success: false,
        message: "Route not found"
      },
      { status: 404 }
    );
  }
};