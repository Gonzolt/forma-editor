import { Captions, Music2, ScanLine, Scissors, Sparkles } from "lucide-react";
// The registry is the extension point for future execution adapters (including Motion Kit).
export const skills = [
  {
    id: "auto",
    label: "Auto",
    icon: Sparkles,
    description: "Find a natural flow for your story.",
  },
  {
    id: "silence",
    label: "Silence cut",
    icon: Scissors,
    description: "Tighten pauses and keep the good parts.",
  },
  {
    id: "captions",
    label: "Captions",
    icon: Captions,
    description: "Give every word a place on screen.",
  },
  {
    id: "color",
    label: "Color",
    icon: ScanLine,
    description: "Bring your clips into the same world.",
  },
  {
    id: "music",
    label: "Music",
    icon: Music2,
    description: "Set the pace with a soundtrack.",
  },
];
export const suggestions = [
  "Make a 30s highlight reel",
  "Remove ums and long pauses",
  "Add Norwegian captions",
  "Match colors across clips",
];
export const templates = [
  {
    title: "The highlight reel",
    category: "THE GOOD PARTS",
    number: "01",
    description: "A little less footage. A lot more feeling.",
    prompt:
      "Make a 30s highlight reel. Keep the strongest moments, with a natural flow and a clean ending.",
    skills: ["auto", "music"],
    aspect: "9:16" as const,
  },
  {
    title: "Say it clearly",
    category: "TALKING HEAD",
    number: "02",
    description: "Your words, with room to breathe.",
    prompt:
      "Remove ums and long pauses. Keep my voice natural and add readable captions.",
    skills: ["silence", "captions"],
    aspect: "16:9" as const,
  },
  {
    title: "A small story",
    category: "EVERYDAY CINEMA",
    number: "03",
    description: "Turn a handful of moments into a story.",
    prompt:
      "Create a short cinematic story from these clips. Match the colors and use gentle pacing.",
    skills: ["auto", "color"],
    aspect: "16:9" as const,
  },
];
