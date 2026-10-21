import { useMemo, useRef } from "react";
import type { Decisions, ImageSet, ImageSetDecision } from "../../shared/types.js";
import { getSetRow, type LibrarySetRow } from "../reviewModel.js";

interface RowEntry {
   decision: ImageSetDecision | undefined;
   row: LibrarySetRow;
}

/**
 * Per-set filmstrip rows, cached by set. A decisions update only recomputes rows
 * whose decision reference changed (untouched sets reuse the previous row), and
 * a new groups array (rescan) invalidates everything, including sets that
 * disappeared.
 */
export const useLibraryRows = (groups: ImageSet[], decisions: Decisions): Map<string, LibrarySetRow> => {
   const cache = useRef<{ groups: ImageSet[]; rows: Map<string, RowEntry> }>({ groups: [], rows: new Map() });

   return useMemo(() => {
      const previousRows = cache.current.groups === groups ? cache.current.rows : null;
      const nextRows = new Map<string, RowEntry>();
      const view = new Map<string, LibrarySetRow>();
      for (const imageSet of groups) {
         const decision = decisions[imageSet.id];
         const previous = previousRows?.get(imageSet.id);
         const entry = previous !== undefined && previous.decision === decision ? previous : { decision, row: getSetRow(imageSet, decision) };
         nextRows.set(imageSet.id, entry);
         view.set(imageSet.id, entry.row);
      }
      cache.current = { groups, rows: nextRows };
      return view;
   }, [groups, decisions]);
};
