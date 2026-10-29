const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};
const inside = (root, filename) => {
  const relative = path.relative(root, filename);
  return (
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
};
async function validateProject(root) {
  const absolute = await fs.realpath(root);
  for (const file of ["lib/stage.js", "package.json"])
    if (!(await fs.stat(path.join(absolute, file))).isFile())
      throw new Error(
        "Choose a MotionKit folder containing lib/stage.js and package.json.",
      );
  if (!(await fs.stat(path.join(absolute, "brands"))).isDirectory())
    throw new Error("This MotionKit project has no brands folder.");
  return absolute;
}
async function listFilms(root) {
  const films = [];
  for (const brand of await fs.readdir(path.join(root, "brands"), {
    withFileTypes: true,
  })) {
    if (!brand.isDirectory() || brand.name.startsWith(".")) continue;
    const directory = path.join(root, "brands", brand.name, "films");
    for (const file of await fs
      .readdir(directory, { withFileTypes: true })
      .catch(() => [])) {
      if (!file.isFile() || !file.name.endsWith(".html")) continue;
      const name = file.name.slice(0, -5);
      const id = `${brand.name}/${name}`;
      const resolved = await fs.realpath(path.join(directory, file.name));
      if (!inside(root, resolved)) continue;
      films.push({
        id,
        name,
        brand: brand.name,
        url: `forma-kit://project/brands/${encodeURIComponent(brand.name)}/films/${encodeURIComponent(file.name)}`,
      });
    }
  }
  return films.sort((a, b) =>
    a.id === "lab/motionlab"
      ? -1
      : b.id === "lab/motionlab"
        ? 1
        : a.id.localeCompare(b.id),
  );
}
async function listGuides(root) {
  const directory = path.join(root, ".claude", "skills");
  const guides = [];
  for (const entry of await fs
    .readdir(directory, { withFileTypes: true })
    .catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const filename = await fs
      .realpath(path.join(directory, entry.name, "SKILL.md"))
      .catch(() => null);
    if (!filename || !inside(root, filename)) continue;
    if ((await fs.stat(filename)).size > 256000) continue;
    const content = await fs.readFile(filename, "utf8");
    guides.push({
      id: entry.name,
      name: /^name:\s*(.+)$/m.exec(content)?.[1]?.trim() || entry.name,
      description:
        /^description:\s*(.+)$/m.exec(content)?.[1]?.trim() ||
        "MotionKit editing guide",
      content,
    });
  }
  return guides.sort((a, b) => a.name.localeCompare(b.name));
}
async function serveProject(root, request, net) {
  try {
    const url = new URL(request.url);
    if (url.hostname !== "project")
      return new Response("Not found", { status: 404 });
    const segments = decodeURIComponent(url.pathname)
      .split(/[\\/]+/)
      .filter(Boolean);
    if (segments.some((s) => s.startsWith(".")) || !segments.length)
      return new Response("Forbidden", { status: 403 });
    const filename = await fs.realpath(path.join(root, ...segments));
    const mime = MIME[path.extname(filename).toLowerCase()];
    if (!inside(root, filename) || !mime || !(await fs.stat(filename)).isFile())
      return new Response("Forbidden", { status: 403 });
    const response = await net.fetch(pathToFileURL(filename).href, {
      headers: request.headers,
    });
    const headers = new Headers(response.headers);
    headers.set("Content-Type", mime);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'",
    );
    // Explicit zero-minimum tracks keep the authored 1080×1920 stage centered
    // when MotionKit's grid is fitted into a smaller preview/export viewport.
    if (mime === "text/html") {
      const html = await response.text();
      const fit =
        '<style id="forma-stage-fit">#frame{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)}</style>';
      const carouselFit =
        segments.join("/") === "tools/carousel/index.html"
          ? `<style>html,body{width:100%;height:100%;overflow:hidden}#slide{transform-origin:top left}</style><script>addEventListener('load',()=>{let tries=0;const ready=async()=>{if(!window.READY){if(tries++<300)setTimeout(ready,50);return}await window.READY;const slide=document.getElementById('slide');const fit=()=>{const scale=Math.min(innerWidth/slide.offsetWidth,innerHeight/slide.offsetHeight);if(!Number.isFinite(scale))return;slide.style.position='absolute';slide.style.transform='scale('+scale+')';slide.style.left=((innerWidth-slide.offsetWidth*scale)/2)+'px';slide.style.top=((innerHeight-slide.offsetHeight*scale)/2)+'px'};addEventListener('resize',fit);fit()};ready()})</script>`
          : "";
      headers.delete("Content-Length");
      return new Response(
        /<\/head\s*>/i.test(html)
          ? html.replace(/<\/head\s*>/i, fit + carouselFit + "$&")
          : html + fit + carouselFit,
        { status: response.status, headers },
      );
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response("Source not found", { status: 404 });
  }
}
module.exports = {
  inside,
  validateProject,
  listFilms,
  listGuides,
  serveProject,
};
