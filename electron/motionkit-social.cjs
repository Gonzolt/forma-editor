const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { inside } = require("./kit-project.cjs");
const ID = /^[a-z0-9_-]{1,80}$/i;
async function json(root, relative) {
  const filename = await fs.realpath(path.join(root, relative));
  if (!inside(root, filename) || (await fs.stat(filename)).size > 512000)
    throw new Error("This campaign file is unavailable or too large.");
  return JSON.parse(await fs.readFile(filename, "utf8"));
}
const short = (value) =>
  typeof value === "string" ? value.slice(0, 3000) : "";
async function campaigns(root, films) {
  const entries = await fs
    .readdir(path.join(root, "campaigns"), { withFileTypes: true })
    .catch(() => []);
  const result = [];
  for (const entry of entries.slice(0, 100)) {
    if (!entry.isDirectory() || !ID.test(entry.name)) continue;
    try {
      const brief = await json(root, `campaigns/${entry.name}/brief.json`);
      if (!ID.test(brief.brand || "")) continue;
      const list = (name, prefix, field) => {
        const values = brief[name];
        if (!Array.isArray(values) || values.length > 30) return [];
        return values
          .filter(
            (item) =>
              typeof item?.id === "string" &&
              new RegExp(`^${prefix}\\d{1,3}$`).test(item.id),
          )
          .map((item) => ({
            id: item.id,
            label: short(item[field]) || item.id,
          }));
      };
      const hooks = list("hooks", "H", "onscreen"),
        messages = list("messages", "M", "line"),
        ctas = list("ctas", "C", "button");
      const filmId =
        typeof brief.film === "string" ? brief.film : `${brief.brand}/promo`;
      const film = films.find((film) => film.id === filmId);
      const deck = await json(
        root,
        `campaigns/${entry.name}/carousel.json`,
      ).catch(() => null);
      const size = /^(\d{2,4})x(\d{2,4})$/.exec(deck?.size || "1080x1350");
      const validDeck =
        deck &&
        ID.test(deck.brand || "") &&
        Array.isArray(deck.slides) &&
        deck.slides.length > 0 &&
        deck.slides.length <= 30 &&
        size &&
        +size[1] <= 4096 &&
        +size[2] <= 4096;
      const posts = await json(
        root,
        `campaigns/${entry.name}/posts.json`,
      ).catch(() => null);
      result.push({
        id: entry.name,
        name: short(brief.product) || entry.name,
        objective: short(brief.objective),
        filmId: film?.id || null,
        hooks,
        messages,
        ctas,
        carousel: validDeck
          ? { count: deck.slides.length, width: +size[1], height: +size[2] }
          : null,
        postCount: Array.isArray(posts?.posts)
          ? Math.min(100, posts.posts.length)
          : 0,
      });
    } catch {
      /* A broken optional campaign does not hide the remaining studio. */
    }
  }
  return result;
}
function variantFor(campaign, id) {
  if (typeof id !== "string" || !/^H\d{1,3}-M\d{1,3}-C\d{1,3}$/.test(id))
    throw new Error("Choose a valid campaign variant.");
  const parts = id.split("-");
  if (
    ![campaign.hooks, campaign.messages, campaign.ctas].every((list, index) =>
      list.some((item) => item.id === parts[index]),
    )
  )
    throw new Error("That variant is not in this campaign brief.");
  return id;
}
async function campaignById(kit, id) {
  if (!ID.test(id || ""))
    throw new Error("Choose a campaign from this project.");
  await kit.ensure();
  const campaign = (
    await campaigns(
      kit.root,
      await require("./kit-project.cjs").listFilms(kit.root),
    )
  ).find((item) => item.id === id);
  if (!campaign)
    throw new Error(
      "This campaign is no longer available. Refresh the project.",
    );
  return campaign;
}
async function variantFilm(kit, film, variant) {
  if (variant === undefined || variant === "") return film;
  const campaign = (await campaigns(kit.root, [film])).find(
    (item) => item.filmId === film.id,
  );
  if (!campaign) throw new Error("This film does not have campaign variants.");
  const url = new URL(film.url);
  url.searchParams.set("v", variantFor(campaign, variant));
  return { ...film, url: url.href, variant };
}
async function carouselInfo(kit, id, index) {
  const campaign = await campaignById(kit, id);
  if (
    !campaign.carousel ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= campaign.carousel.count
  )
    throw new Error("Choose a slide from this carousel.");
  return {
    ...campaign.carousel,
    url: `forma-kit://project/tools/carousel/index.html?deck=${encodeURIComponent(`/campaigns/${id}/carousel.json`)}&i=${index}`,
  };
}
async function copyPosts(kit, id) {
  const campaign = await campaignById(kit, id);
  const doc = await json(kit.root, `campaigns/${campaign.id}/posts.json`);
  if (
    !ID.test(doc.brand || "") ||
    !Array.isArray(doc.posts) ||
    doc.posts.length > 100
  )
    throw new Error("This campaign's post copy is invalid.");
  const originalProfile = await json(
    kit.root,
    `brands/${doc.brand}/profile.json`,
  ).catch(() => ({}));
  const profile = {
    voice: {
      words_avoid: Array.isArray(originalProfile.voice?.words_avoid)
        ? originalProfile.voice.words_avoid
            .filter((value) => typeof value === "string" && value.length < 100)
            .slice(0, 100)
        : [],
    },
  };
  // Run only the reviewed bundled checker, never JavaScript from a chosen project.
  const { checkPost } = await import(
    pathToFileURL(path.join(kit.bundledRoot, "tools/copycheck.mjs")).href
  );
  return doc.posts.map((post, index) => {
    const text = (value) => (typeof value === "string" ? value : "");
    const value = {
      platform: short(post.platform),
      caption: text(post.caption),
      text: text(post.text),
      title: text(post.title),
      description: text(post.description),
      thread: Array.isArray(post.thread)
        ? post.thread.slice(0, 30).map(text)
        : [],
      hashtags: Array.isArray(post.hashtags)
        ? post.hashtags.slice(0, 100).map(text)
        : [],
    };
    const body = value.thread.length
      ? value.thread.join("\n\n—\n\n")
      : value.caption ||
        value.text ||
        [value.title, value.description].filter(Boolean).join("\n\n");
    return {
      id: index,
      platform: value.platform,
      text: [body, value.hashtags.join(" ")].filter(Boolean).join("\n\n"),
      problems: checkPost(value, profile),
    };
  });
}
function exportCrop(width, height, mode = "vertical") {
  if (!["vertical", "feed", "square"].includes(mode))
    throw new Error("Choose a supported promo format.");
  const outputHeight =
    mode === "vertical"
      ? height
      : mode === "feed"
        ? Math.round((width * 1.25) / 2) * 2
        : width;
  if (outputHeight > height)
    throw new Error(
      "This film does not fit the selected crop. Choose vertical.",
    );
  return {
    width,
    height: outputHeight,
    filter:
      mode === "vertical"
        ? ""
        : `crop=${width}:${outputHeight}:0:${Math.round((height - outputHeight) / 4) * 2},`,
  };
}
module.exports = {
  campaigns,
  variantFor,
  variantFilm,
  campaignById,
  carouselInfo,
  copyPosts,
  json,
  exportCrop,
};
