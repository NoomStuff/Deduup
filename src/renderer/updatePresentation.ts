import type { AvailableUpdate, UpdateStatus } from "../shared/types.js";
import type { UpdateChipActions } from "./components/TitleBar.js";

export const updatePresentation = (update: AvailableUpdate, status: UpdateStatus | null) => {
   const matching = status?.version === update.version ? status : null;
   const phase = matching?.phase ?? null;
   const downloading = phase === "downloading" || (update.mode === "automatic" && phase === null);
   const percent = matching?.percent ?? null;
   const action: keyof UpdateChipActions | null = downloading
      ? null
      : phase === "ready"
        ? "restart"
        : phase === "downloaded"
          ? "reveal"
          : update.mode === "releases" || (phase === "error" && update.mode !== "download")
            ? "release"
            : "download";
   const label = downloading
      ? percent === null
         ? "Downloading update"
         : `Downloading ${Math.round(percent)}%`
      : action === "restart"
        ? "Apply and restart"
        : action === "reveal"
          ? "Show in Downloads"
          : action === "release"
            ? "View release"
            : phase === "error"
              ? "Retry download"
              : "Download update";
   const message =
      phase === "error"
         ? (matching?.message ?? "The update failed.")
         : phase === "ready"
           ? "Ready to restart"
           : phase === "downloaded"
             ? "Saved to Downloads"
             : downloading
               ? label
               : "An update is available";
   return { phase, downloading, percent, action, label, message };
};
