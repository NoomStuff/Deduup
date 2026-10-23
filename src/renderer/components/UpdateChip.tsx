import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Download, TriangleAlert } from "lucide-react";
import type { AvailableUpdate, UpdateStatus } from "../../shared/types.js";
import "./UpdateChip.css";
import { updatePresentation } from "../updatePresentation.js";

interface Props {
   update: AvailableUpdate;
   status: UpdateStatus | null;
   onDownload: () => void;
   onRestart: () => void;
   onRelease: () => void;
   onReveal: () => void;
}

const ringLength = 53.4;

/** The one-glance update control: a small chip in the title bar that expands on hover and announces new phases. */
export const UpdateChip = ({ update, status, onDownload, onRestart, onRelease, onReveal }: Props) => {
   const [announce, setAnnounce] = useState(true);
   const [expandedWidth, setExpandedWidth] = useState(170);
   const labelRef = useRef<HTMLSpanElement>(null);
   const measureRef = useRef<HTMLSpanElement>(null);
   const { phase, downloading, percent, label, action: actionName } = updatePresentation(update, status);
   const actions = { download: onDownload, restart: onRestart, release: onRelease, reveal: onReveal };
   const action = actionName === null ? undefined : actions[actionName];

   // Announce a new version or phase by holding the chip open, then collapse it.
   useEffect(() => {
      setAnnounce(true);
      const timer = window.setTimeout(() => setAnnounce(false), 3400);
      return () => window.clearTimeout(timer);
   }, [update.version, phase]);

   useLayoutEffect(() => {
      const labelWidth = labelRef.current?.scrollWidth ?? 0;
      const measureWidth = measureRef.current?.scrollWidth ?? 0;
      setExpandedWidth(34 + (downloading ? Math.max(labelWidth, measureWidth) : labelWidth));
   }, [label, downloading]);

   return (
      <div className={`updateChip${announce ? " updateChip--announce" : ""}`} style={{ "--update-chip-width": `${expandedWidth}px` } as React.CSSProperties}>
         <button
            type="button"
            className={`updateChip__trigger${phase !== null ? ` updateChip__trigger--${phase}` : ""}`}
            aria-disabled={action === undefined}
            aria-label={label}
            title={phase === "error" && status?.message !== undefined ? status.message : `Deduup ${update.version} · ${label}`}
            onClick={action}
         >
            <span aria-hidden="true" className="updateChip__icon">
               {downloading ? (
                  <svg className={`updateChip__ring${percent === null ? " updateChip__ring--indeterminate" : ""}`} viewBox="0 0 24 24">
                     <circle className="updateChip__ringTrack" cx="12" cy="12" r="8.5" />
                     <circle className="updateChip__ringFill" cx="12" cy="12" r="8.5" style={{ strokeDashoffset: ringLength * (1 - (percent ?? 25) / 100) }} />
                  </svg>
               ) : phase === "ready" || phase === "downloaded" ? (
                  <Check />
               ) : phase === "error" ? (
                  <TriangleAlert />
               ) : (
                  <Download />
               )}
            </span>
            <span className="updateChip__label" ref={labelRef}>
               {label}
            </span>
            <span aria-hidden="true" className="updateChip__measure" ref={measureRef}>
               Downloading 100%
            </span>
         </button>
      </div>
   );
};
