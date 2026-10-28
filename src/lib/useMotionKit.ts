import { useCallback, useEffect, useState } from "react";
import { desktop } from "./bridge";
import type { KitJob, MotionKitStatus } from "../types";
export function useMotionKit(enabled: boolean) {
  const [status, setStatus] = useState<MotionKitStatus | null>(null);
  const [job, setJob] = useState<KitJob | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!desktop) {
      setError(
        "Open the desktop app to use MotionKit previews and video exports.",
      );
      return;
    }
    try {
      const next = await desktop.motionKit.status();
      setStatus(next);
      setJob((current) =>
        !next.job ||
        (current?.id === next.job.id && current.revision > next.job.revision)
          ? current
          : next.job,
      );
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "MotionKit could not be loaded.",
      );
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    if (!desktop) {
      void refresh();
      return;
    }
    const unsubscribe = desktop.motionKit.onJob((next) => {
      setJob((current) =>
        current?.id === next.id && current.revision > next.revision
          ? current
          : next,
      );
      if (next.status === "completed") void refresh();
    });
    void refresh();
    return unsubscribe;
  }, [enabled, refresh]);
  const busy =
    !!job &&
    ["preparing", "rendering", "encoding", "verifying"].includes(job.status);
  return { status, job, busy, error, refresh };
}
