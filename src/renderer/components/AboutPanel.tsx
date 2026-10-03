import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { OverlayPanel } from "./OverlayPanel.js";
import "./AboutPanel.css";

const openPage = (url: string): void => {
   void window.imageDeduplicator.openExternal(url).catch(() => undefined);
};

const AboutPanel = ({ onClose }: { onClose: () => void }) => {
   const [info, setInfo] = useState<{ name: string; version: string } | null>(null);
   useEffect(() => {
      let active = true;
      void window.imageDeduplicator
         .getAppInfo()
         .then((value) => {
            if (active) setInfo(value);
         })
         .catch(() => undefined);
      return () => {
         active = false;
      };
   }, []);

   return (
      <OverlayPanel
         backdropClassName="aboutPanel__backdrop"
         closeLabel="Close about"
         labelledBy="about-title"
         rootClassName="aboutPanel"
         surfaceClassName="aboutPanel__surface panelModal aboutModal"
         onClose={onClose}
      >
         <div className="aboutPanel__head">
            <span className="aboutPanel__mark" aria-hidden="true">
               <img alt="" src="icon.png" />
            </span>
            <div>
               <h2 id="about-title">{info === null ? "Deduup" : info.name}</h2>
               <p>{info === null ? "" : `Version ${info.version}`}</p>
            </div>
         </div>
         <p className="aboutPanel__tagline">Clear identical files with ease.</p>
         <p>
            It scans a folder for images that look the same, groups them into sets you judge once, and moves what you discard into a duplicate folder that stays
            undoable until you recycle it. Nothing leaves the machine.
         </p>
         <div className="aboutPanel__links">
            <button onClick={() => openPage("https://github.com/NoomStuff/Deduup")} type="button">
               GitHub
            </button>
            <button onClick={() => openPage("https://github.com/NoomStuff/Deduup/blob/main/LICENSE")} type="button">
               MIT License
            </button>
            <button onClick={() => openPage("https://github.com/NoomStuff/Deduup/releases")} type="button">
               Releases
            </button>
         </div>
         <footer className="aboutPanel__footer">
            Vibe-coded with <Heart aria-hidden="true" /> by{" "}
            <button onClick={() => openPage("https://noomstuff.com")} type="button">
               NoomStuff
            </button>
         </footer>
      </OverlayPanel>
   );
};

export { AboutPanel };
