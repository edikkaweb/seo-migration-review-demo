import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist"),
  port = Number(process.env.PORT || 4190),
  prefix = "/seo-migration-review-demo/";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};
http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname === "/") {
      res.writeHead(302, { Location: prefix });
      return res.end();
    }
    if (!u.pathname.startsWith(prefix)) {
      res.writeHead(404);
      return res.end();
    }
    try {
      let p = decodeURIComponent(u.pathname.slice(prefix.length));
      if (!p) p = "index.html";
      const target = path.resolve(root, p);
      if (!target.startsWith(root + path.sep)) throw new Error();
      const b = await fs.readFile(target);
      res.writeHead(200, {
        "Content-Type":
          mime[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(b);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Aperçu : http://127.0.0.1:${port}${prefix}`),
  );
