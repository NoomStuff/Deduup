import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { OverlayPanel } from "./OverlayPanel.js";
import "./HelpPanel.css";
import { navigatePanelTabs } from "./panelTabNavigation.js";

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
               <li>The scanner sorts similar images into sets along the strip at the bottom, grouped by image difference. Lower means more alike.</li>
               <li>
                  In each set, keep the image you prefer and discard the rest. The number on each image is its key: 1–9 discard images, K keeps only the
                  selected one, X discards a whole set, and Autoselect (right-click a set or band) keeps the largest image of a set.
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
            <h3>Choosing what to keep</h3>
            <ul>
               <li>
                  Where the images of a set differ, the larger resolution and file size read <strong>green</strong> and weaker values fade. Identical values
                  stay plain.
               </li>
               <li>
                  The <strong>Largest</strong> tag marks the image Autoselect would keep. It is a suggestion; the choice is yours.
               </li>
               <li>When a set spans folders, each image shows its folder.</li>
            </ul>
            <h3>Discarding</h3>
            <ul>
               <li>
                  Select an image, then <strong>Discard</strong>, or press the number shown on the image. Shift Click does the same without selecting.
               </li>
               <li>
                  <strong>Keep only this</strong> (K) discards every other image in the set. Hold Ctrl with a number key or K to move on to the next set in the
                  same press.
               </li>
               <li>
                  <strong>X</strong> discards every image in the set; <strong>V</strong> autoselects sets without existing choices in the band.
               </li>
               <li>Right-click an image, a set tile, or a band tag for its full menu.</li>
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
            <h3>The final review</h3>
            <p>
               Every set with discards appears beside what it keeps, and sets that keep nothing are flagged. Click any image there to return to its set and
               change your mind before anything moves.
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
         <div aria-label="Help topics" className="panelModal__tabs" onKeyDown={navigatePanelTabs} role="tablist">
            {topics.map((topic) => (
               <button
                  aria-selected={tab === topic.id}
                  aria-controls="help-panel"
                  id={`help-tab-${topic.id}`}
                  tabIndex={tab === topic.id ? 0 : -1}
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
         <div aria-labelledby={`help-tab-${tab}`} className="panelModal__body helpPanel__body" id="help-panel" ref={bodyRef} role="tabpanel" tabIndex={0}>
            {topic?.body ?? null}
         </div>
      </OverlayPanel>
   );
};

export { HelpPanel };
