import { useEffect, useState } from "react";
import { ArrowRight, Copy, FolderOpen, Layers, Square } from "lucide-react";
import { desktop } from "../lib/bridge";
import type {
  CarouselPreview,
  KitJob,
  KitPreview,
  MotionKitStatus,
  SocialPost,
} from "../types";
import "../social.css";

export function SocialStudio({
  status,
  job,
  busy,
  onNotice,
  onLibrary,
}: {
  status: MotionKitStatus;
  job: KitJob | null;
  busy: boolean;
  onNotice: (text: string) => void;
  onLibrary: () => void;
}) {
  const [id, setId] = useState(status.campaigns[0]?.id || "");
  const campaign =
    status.campaigns.find((item) => item.id === id) || status.campaigns[0];
  const [mode, setMode] = useState<"promo" | "carousel" | "copy">("promo");
  const [hook, setHook] = useState(""),
    [message, setMessage] = useState(""),
    [cta, setCta] = useState("");
  const [slide, setSlide] = useState(0);
  const [preview, setPreview] = useState<KitPreview | CarouselPreview | null>(
    null,
  );
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState<"360p" | "720p" | "1080p" | "4K">(
    "720p",
  );
  const [crop, setCrop] = useState<"vertical" | "feed" | "square">("vertical");
  const [from, setFrom] = useState(0),
    [to, setTo] = useState(15);
  const [guides, setGuides] = useState(false),
    [starting, setStarting] = useState(false);
  const variant = [
    hook || campaign?.hooks[0]?.id,
    message || campaign?.messages[0]?.id,
    cta || campaign?.ctas[0]?.id,
  ]
    .filter(Boolean)
    .join("-");
  useEffect(() => {
    setHook("");
    setMessage("");
    setCta("");
    setSlide(0);
  }, [campaign?.id, status.root]);
  useEffect(() => {
    if (!campaign || !desktop) return;
    let alive = true;
    setPreview(null);
    setPosts([]);
    setError("");
    const timer = setTimeout(() => {
      const task =
        mode === "copy"
          ? desktop!.motionKit.posts(campaign.id)
          : mode === "carousel"
            ? desktop!.motionKit.carousel(campaign.id, slide)
            : campaign.filmId
              ? desktop!.motionKit.preview(campaign.filmId, variant)
              : Promise.reject(new Error("This campaign has no promo film."));
      task
        .then((result) => {
          if (!alive) return;
          if (Array.isArray(result)) setPosts(result);
          else {
            setPreview(result);
            if ("duration" in result) {
              setFrom(0);
              setTo(result.duration);
            }
          }
        })
        .catch((error) => {
          if (alive)
            setError(
              error instanceof Error
                ? error.message
                : "Could not load this campaign.",
            );
        });
    }, 140);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [campaign?.id, campaign?.filmId, variant, slide, mode, status.root]);
  async function act(action: () => Promise<unknown>) {
    setStarting(true);
    try {
      await action();
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "The action could not finish.",
      );
    } finally {
      setStarting(false);
    }
  }
  if (!campaign)
    return (
      <div className="social-empty">
        <Layers size={28} />
        <h2>Your next campaign starts here.</h2>
        <p>
          This project has no social campaign briefs. Use the included MotionKit
          project to explore promos, carousels and post copy.
        </p>
      </div>
    );
  const previewUrl = preview ? new URL(preview.url) : null;
  if (guides && mode === "promo") previewUrl?.searchParams.set("guides", "");
  const matching =
    job &&
    (job.filmId === campaign.filmId || job.filmId === `carousel/${campaign.id}`)
      ? job
      : null;
  const invalidRange =
    !preview ||
    !("duration" in preview) ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    to <= from ||
    to > preview.duration;
  return (
    <section className="social-studio" aria-label="Social campaigns">
      <div className="social-topline">
        <label>
          Campaign
          <select
            aria-label="Social campaign"
            value={campaign.id}
            disabled={busy}
            onChange={(event) => setId(event.target.value)}
          >
            {status.campaigns.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.id}
              </option>
            ))}
          </select>
        </label>
        <p>{campaign.objective}</p>
      </div>
      <div className="social-mode" role="group" aria-label="Campaign tools">
        {(
          [
            ["promo", "Promo variants"],
            ["carousel", "Carousel slides"],
            ["copy", "Post copy"],
          ] as const
        ).map(([value, label]) => (
          <button
            className={`button ${mode === value ? "primary" : ""}`}
            key={value}
            onClick={() => setMode(value)}
            aria-pressed={mode === value}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {mode === "copy" ? (
        <div className="social-posts">
          <p className="field-help">
            Checks use MotionKit’s platform and brand presets. Review the
            destination app’s current limits before publishing.
          </p>
          {posts.map((post) => (
            <article className="social-post" key={post.id}>
              <div className="social-post-heading">
                <h3>{post.platform}</h3>
                <button
                  className="button"
                  disabled={!desktop}
                  onClick={() =>
                    void act(async () => {
                      await desktop!.motionKit.copyPost(campaign.id, post.id);
                      onNotice("Post copy copied to the clipboard.");
                    })
                  }
                >
                  <Copy size={14} /> Copy post
                </button>
              </div>
              <pre>{post.text}</pre>
              {post.problems.length ? (
                <ul>
                  {post.problems.map((problem, index) => (
                    <li key={index} className={`copy-${problem.level}`}>
                      {problem.msg}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="field-help">Passes MotionKit’s copy checks.</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="social-editor">
          <div
            className="social-preview"
            style={{
              aspectRatio: preview
                ? `${preview.width}/${preview.height}`
                : "4/5",
            }}
          >
            {previewUrl ? (
              <iframe
                title={
                  mode === "promo"
                    ? "Social promo preview"
                    : "Carousel slide preview"
                }
                src={previewUrl.href}
                sandbox="allow-scripts allow-same-origin"
                allow="autoplay"
              />
            ) : (
              <p>{error ? "Preview unavailable" : "Preparing preview…"}</p>
            )}
          </div>
          <div className="social-controls">
            {mode === "promo" ? (
              <>
                <span className="eyebrow">
                  ONE BRIEF. A FEW GOOD DIRECTIONS.
                </span>
                <h2>Find your strongest opening.</h2>
                {(
                  [
                    ["Hook", campaign.hooks, hook, setHook],
                    ["Message", campaign.messages, message, setMessage],
                    ["Call to action", campaign.ctas, cta, setCta],
                  ] as const
                ).map(([label, list, value, change]) => (
                  <label key={label}>
                    {label}
                    <select
                      aria-label={`Promo ${label.toLowerCase()}`}
                      value={value || list[0]?.id || ""}
                      disabled={busy}
                      onChange={(event) => change(event.target.value)}
                    >
                      {list.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <p className="field-help">
                  {campaign.hooks.length *
                    campaign.messages.length *
                    campaign.ctas.length}{" "}
                  combinations · Selected {variant}
                </p>
                <label className="social-checkbox">
                  <input
                    type="checkbox"
                    checked={guides}
                    onChange={(event) => setGuides(event.target.checked)}
                  />{" "}
                  Show additional crop guides in preview
                </label>
                <div className="social-export-options">
                  <label>
                    Quality
                    <select
                      aria-label="Promo export quality"
                      value={quality}
                      disabled={busy}
                      onChange={(event) =>
                        setQuality(event.target.value as typeof quality)
                      }
                    >
                      {["360p", "720p", "1080p", "4K"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Format
                    <select
                      aria-label="Promo format"
                      value={crop}
                      disabled={busy}
                      onChange={(event) =>
                        setCrop(event.target.value as typeof crop)
                      }
                    >
                      <option value="vertical">Vertical · 9:16</option>
                      <option value="feed">Feed · 4:5</option>
                      <option value="square">Square · 1:1</option>
                    </select>
                  </label>
                </div>
                <div className="social-export-options">
                  <label>
                    From (seconds)
                    <input
                      aria-label="Promo start time"
                      type="number"
                      step="0.1"
                      min="0"
                      value={from}
                      disabled={busy}
                      onChange={(event) => setFrom(event.target.valueAsNumber)}
                    />
                  </label>
                  <label>
                    To (seconds)
                    <input
                      aria-label="Promo end time"
                      type="number"
                      step="0.1"
                      min="0"
                      value={to}
                      disabled={busy}
                      onChange={(event) => setTo(event.target.valueAsNumber)}
                    />
                  </label>
                </div>
                <button
                  className="button primary"
                  disabled={!desktop || busy || starting || invalidRange}
                  onClick={() =>
                    void act(() =>
                      desktop!.motionKit.export({
                        filmId: campaign.filmId!,
                        variant,
                        crop,
                        quality,
                        fps: 30,
                        from,
                        to,
                      }),
                    )
                  }
                >
                  Export promo MP4 <ArrowRight size={15} />
                </button>
                <p className="field-help">
                  Exports the selected combination at 30 fps. This sample has no
                  soundtrack attached.
                </p>
              </>
            ) : (
              <>
                <span className="eyebrow">A STORY, ONE SLIDE AT A TIME.</span>
                <h2>Ready for the feed.</h2>
                <p>
                  Export the campaign’s brand-styled slides as full-resolution
                  PNG images.
                </p>
                <label>
                  Slide
                  <select
                    aria-label="Carousel slide"
                    value={slide}
                    onChange={(event) => setSlide(Number(event.target.value))}
                  >
                    {Array.from(
                      { length: campaign.carousel?.count || 0 },
                      (_, index) => (
                        <option value={index} key={index}>
                          Slide {index + 1}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <p className="field-help">
                  {campaign.carousel?.count || 0} slides ·{" "}
                  {campaign.carousel?.width} × {campaign.carousel?.height}
                </p>
                <button
                  className="button primary"
                  disabled={!desktop || busy || starting || !preview}
                  onClick={() =>
                    void act(() =>
                      desktop!.motionKit.exportCarousel(campaign.id),
                    )
                  }
                >
                  Export carousel PNGs <ArrowRight size={15} />
                </button>
              </>
            )}
            {matching && (
              <div
                className={`social-job social-job-${matching.status}`}
                role="status"
              >
                <p>{matching.message}</p>
                {busy && (
                  <>
                    <progress
                      aria-label="Social export progress"
                      value={matching.progress}
                      max={100}
                    />
                    <button
                      className="button"
                      onClick={() =>
                        void act(() => desktop!.motionKit.cancel())
                      }
                    >
                      <Square size={12} /> Stop export
                    </button>
                  </>
                )}
                {matching.status === "completed" &&
                  (matching.carouselResult ? (
                    <button
                      className="button"
                      onClick={() =>
                        void act(() =>
                          desktop!.motionKit.revealCarousel(
                            matching.carouselResult!.id,
                          ),
                        )
                      }
                    >
                      <FolderOpen size={14} /> Open slides folder
                    </button>
                  ) : (
                    <button className="button" onClick={onLibrary}>
                      View saved video <ArrowRight size={14} />
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
