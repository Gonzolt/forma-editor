const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const version = require("../package.json").version;
const tag = process.env.GITHUB_REF_NAME;
if (!/^v\d+\.\d+\.\d+$/.test(tag || "") || tag !== `v${version}`)
  throw new Error(
    "The release tag must match package.json. No release assets were uploaded.",
  );
if (process.argv.includes("--validate")) process.exit(0);
const directory = path.resolve(__dirname, "../release");
const files = fs
  .readdirSync(directory)
  .filter(
    (name) =>
      name.startsWith(`Forma-${version}-`) &&
      !name.includes(".__") &&
      /\.(exe|dmg|zip)$/.test(name),
  )
  .map((name) => path.join(directory, name));
if (!files.length)
  throw new Error("No installers were produced for this release.");
execFileSync("gh", ["release", "upload", tag, ...files, "--clobber"], {
  stdio: "inherit",
  windowsHide: true,
});
