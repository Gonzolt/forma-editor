import type { EditPlan, EditSession } from "../types";
// Replace this adapter with real planning/rendering. No provider or render calls are made here.
export const phases = [
  "Reading your brief",
  "Arranging the story",
  "Shaping the details",
  "Preparing your edit plan",
];
export function makeDemoPlan(session: EditSession): EditPlan {
  const actions: Record<string, string> = {
    auto: "Arrange the strongest moments into a beginning, middle and ending.",
    silence: "Review pauses and filler words, preserving natural speech.",
    captions: /norwegian/i.test(session.prompt)
      ? "Prepare Norwegian captions for review."
      : "Prepare readable captions aligned with the dialogue.",
    color: "Match exposure and color between the selected clips.",
    music: "Choose a soundtrack and align key moments to the beat.",
  };
  return {
    title: "A first direction",
    summary: `${session.files.length} source ${session.files.length === 1 ? "file" : "files"} · ${session.aspect} · ${session.length === "Auto" ? "Natural length" : session.length} · MP4 / ${session.quality}`,
    steps: [
      "Review the source media against your brief.",
      ...session.skills.map((s) => actions[s]).filter(Boolean),
      "Preview the cut and confirm the final export settings.",
    ],
  };
}
