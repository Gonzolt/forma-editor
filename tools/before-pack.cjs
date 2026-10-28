const prepare = require("./prepare-ffmpeg.cjs");
exports.default = (context) =>
  prepare(
    context.electronPlatformName,
    require("builder-util").Arch[context.arch],
  );
