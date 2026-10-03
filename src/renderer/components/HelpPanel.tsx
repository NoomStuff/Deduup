import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { OverlayPanel } from "./OverlayPanel.js";
import "./HelpPanel.css";

type HelpTab = "intro" | "start" | "reviewing";

const topics: { id: HelpTab; label: string; body: ReactNode }[] = [
   {
      id: "intro",
      label: "Introduction",
      body: (
         <>
            <h3>Find the duplicates. Keep the best one.</h3>
            <p>
               This app scans a folder for images that look the same: exact duplicates, resizes, re-encodes, and light edits. It groups them into sets, so you
               judge each group once instead of file by file.
            </p>
            <p>
               You discard the images you don't want, confirm the move in the final review, and the app moves them into the duplicate folder. Nothing is removed
               on its own.
            </p>
         </>
      ),
   },
   {
      id: "start",
      label: "Getting started",
      body: (
         <>
            <ol>
               <li>Open a folder. Drag it onto the window, or use File in the menu bar.</li>
               <li>The scanner sorts near-identical images into sets along the strip at the bottom, grouped by pixel difference. Lower means more alike.</li>
               <li>
                  In each set, keep the image you prefer and discard the rest. Numbers 1–9 discard images, X discards a whole set, and Autoselect (right-click a
                  set or band) keeps the largest image of a set.
               </li>
               <li>Open the final review, move the discarded images to the duplicate folder, and recycle that folder when you're happy.</li>
            </ol>
            <h3>Worth knowing</h3>
            <ul>
               <li>Nothing moves while you review. Discards are undoable, and so are moves until you recycle the folder.</li>
               <li>The duplicate folder lives inside your scan folder. Everything in it is recoverable until you recycle it from the final review.</li>
               <li>Rotated, cropped, and mirrored variants are not detected.</li>
               <li>Every shortcut can be rebound in Settings, under Keyboard shortcuts.</li>
            </ul>
         </>
      ),
   },
   {
      id: "reviewing",
      label: "Reviewing",
      body: (
         <>
            <p>A set is one group of related images. Select an image and the header offers the actions that apply to it.</p>
            <h3>Discarding</h3>
            <ul>
               <li>
                  Select an image, then <strong>Discard</strong>. Shift Click and the number keys (Ctrl shows the numbers on the shelf) do the same without
                  leaving the shelf.
               </li>
               <li>
                  <strong>X</strong> discards every image in the set; <strong>V</strong> autoselects sets without existing choices in the band.
               </li>
               <li>Right-click an image, a set tile, or a band tag for its full menu, including Keep only this.</li>
            </ul>
            <h3>Comparing</h3>
            <p>
               Select an image and press Compare. With exactly two images the comparison opens right away; with more, you pick the second image from the shelf.
               Move across the image to wipe between them, then keep one.
            </p>
            <h3>The filmstrip</h3>
            <p>
               The dot under a set tile reflects its choices: gray has no discards, amber has some, and red means every image is discarded. Click a tile to jump
               there; a band tag jumps to its whole group.
            </p>
         </>
      ),
   },
];

const HelpPanel = ({ onClose }: { onClose: () => void }) => {
   const [tab, setTab] = useState<HelpTab>("intro");
   const bodyRef = useRef<HTMLDivElement>(null);
   const topic = topics.find((candidate) => candidate.id === tab) ?? topics[0];
   return (
      <OverlayPanel
         backdropClassName="helpPanel__backdrop"
         closeLabel="Close help"
         labelledBy="help-title"
         rootClassName="helpPanel"
         surfaceClassName="helpPanel__surface panelModal helpModal"
         onClose={onClose}
      >
         <header className="panelModal__header">
            <div>
               <h2 id="help-title">Help</h2>
               <p className="helpPanel__sub">Any shortcut can be rebound in Settings.</p>
            </div>
            <button aria-label="Close help" className="iconButton" onClick={onClose} type="button">
               <X aria-hidden="true" />
            </button>
         </header>
         <div className="panelModal__tabs" role="tablist">
            {topics.map((topic) => (
               <button
                  aria-selected={tab === topic.id}
                  key={topic.id}
                  onClick={() => {
                     setTab(topic.id);
                     bodyRef.current?.scrollTo(0, 0);
                  }}
                  role="tab"
                  type="button"
               >
                  {topic.label}
               </button>
            ))}
         </div>
         <div className="panelModal__body helpPanel__body" ref={bodyRef}>
            {topic?.body ?? null}
         </div>
      </OverlayPanel>
   );
};

export { HelpPanel };
