import { useCallback, useEffect, useRef, useState } from "react";
import { desktop } from "./bridge";
import type { UpdateStatus } from "../types";
export function useUpdates(
  enabled: boolean,
  notify: (message: string) => void,
) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const announced = useRef("");
  const accept = useCallback(
    (next: UpdateStatus) => {
      setStatus(next);
      if (!next.checking && next.checkedAt) {
        const signature = `${next.app.available ? next.app.latestVersion : ""}|${next.motionkit.available ? next.motionkit.latestRevision : ""}`;
        if (signature !== "|" && signature !== announced.current) {
          announced.current = signature;
          notify(
            next.app.available && next.motionkit.available
              ? "Updates are available for Forma and MotionKit. Open Settings → Updates."
              : next.app.available
                ? `Forma ${next.app.latestVersion} is available. Open Settings → Updates.`
                : "A MotionKit update is available. Open Settings → Updates.",
          );
        }
      }
    },
    [notify],
  );
  useEffect(() => {
    if (!enabled || !desktop) return;
    const unsubscribe = desktop.updates.onStatus(accept);
    desktop.updates
      .status()
      .then(accept)
      .catch(() => {});
    return unsubscribe;
  }, [enabled, accept]);
  const check = useCallback(async () => {
    if (!desktop) return;
    try {
      accept(await desktop.updates.check());
    } catch {
      notify("The update check could not finish. Try again later.");
    }
  }, [accept, notify]);
  const open = useCallback(
    async (target: "forma" | "motionkit") => {
      try {
        await desktop?.updates.open(target);
      } catch {
        notify("The GitHub update page could not be opened.");
      }
    },
    [notify],
  );
  return {
    status,
    check,
    open,
    available: !!status && (status.app.available || status.motionkit.available),
  };
}
