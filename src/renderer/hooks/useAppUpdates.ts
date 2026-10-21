import { useEffect, useMemo, useState } from "react";
import type { AvailableUpdate, UpdateStatus } from "../../shared/types.js";
import type { UpdateChipActions } from "../components/TitleBar.js";

interface AppUpdatesOptions {
   loading: boolean;
   reportError: (title: string, error: unknown, fallback: string) => void;
}

export const useAppUpdates = ({ loading, reportError }: AppUpdatesOptions) => {
   const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
   const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

   // One update check per launch once the app is up; failures stay silent, the
   // chip only appears when a newer release exists.
   useEffect(() => {
      if (loading) return undefined;
      let active = true;
      void window.imageDeduplicator
         .checkForUpdate()
         .then((update) => {
            if (active) setAvailableUpdate(update);
         })
         .catch(() => undefined);
      return () => {
         active = false;
      };
   }, [loading]);
   useEffect(() => window.imageDeduplicator.onUpdateStatus(setUpdateStatus), []);

   const updateActions = useMemo<UpdateChipActions>(
      () => ({
         download: () => {
            if (availableUpdate === null) return;
            void window.imageDeduplicator.downloadUpdate(availableUpdate.version).catch(() => undefined);
         },
         restart: () => {
            void window.imageDeduplicator
               .restartToUpdate()
               .catch((error: unknown) => reportError("Couldn't apply the update", error, "Failed to restart into the update"));
         },
         release: () => {
            if (availableUpdate === null) return;
            void window.imageDeduplicator.openExternal(availableUpdate.url).catch(() => undefined);
         },
         reveal: () => {
            void window.imageDeduplicator.revealUpdateDownload().catch(() => undefined);
         },
      }),
      [availableUpdate, reportError]
   );

   return { availableUpdate, updateActions, updateStatus };
};
