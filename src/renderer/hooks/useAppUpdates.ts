import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UpdateState } from "../../shared/types.js";
import type { UpdateChipActions } from "../components/TitleBar.js";
import { preferenceKeys, usePreference } from "./usePreference.js";

interface AppUpdatesOptions {
   loading: boolean;
   beforeRestart: () => Promise<void>;
   reportError: (title: string, error: unknown, fallback: string) => void;
}

export const useAppUpdates = ({ loading, beforeRestart, reportError }: AppUpdatesOptions) => {
   const [state, setState] = useState<UpdateState>({ update: null, status: null, checking: false, lastChecked: null, message: "", checkError: null });
   const [checkOnStartup, setCheckOnStartup] = usePreference(preferenceKeys.checkForUpdates, true);
   const startupCheckEnabled = useRef(checkOnStartup).current;
   const [appVersion, setAppVersion] = useState("");
   const availableUpdate = state.update;

   useEffect(() => {
      let active = true;
      let received = false;
      const unsubscribe = window.imageDeduplicator.onUpdateState((next) => {
         received = true;
         setState(next);
      });
      void window.imageDeduplicator
         .getUpdateState()
         .then((next) => {
            if (active && !received) setState(next);
         })
         .catch(() => undefined);
      void window.imageDeduplicator
         .getAppInfo()
         .then((info) => {
            if (active) setAppVersion(info.version);
         })
         .catch(() => undefined);
      return () => {
         active = false;
         unsubscribe();
      };
   }, []);

   // The main process deduplicates launch checks, including renderer reloads.
   useEffect(() => {
      if (!loading && startupCheckEnabled) void window.imageDeduplicator.checkForUpdate(false).catch(() => undefined);
   }, [loading, startupCheckEnabled]);

   const checkForUpdates = useCallback(() => {
      void window.imageDeduplicator.checkForUpdate().catch((error: unknown) => reportError("Couldn't check for updates", error, "Try again later."));
   }, [reportError]);

   const updateActions = useMemo<UpdateChipActions>(
      () => ({
         download: () => {
            if (availableUpdate === null) return;
            void window.imageDeduplicator
               .downloadUpdate(availableUpdate.version)
               .catch((error: unknown) => reportError("Couldn't download the update", error, "Try again later."));
         },
         restart: () => {
            void beforeRestart()
               .then(() => window.imageDeduplicator.restartToUpdate())
               .catch((error: unknown) => reportError("Couldn't apply the update", error, "Failed to restart into the update"));
         },
         release: () => {
            if (availableUpdate === null) return;
            void window.imageDeduplicator
               .openExternal(availableUpdate.url)
               .catch((error: unknown) => reportError("Couldn't open the release", error, "Try again later."));
         },
         reveal: () => {
            void window.imageDeduplicator
               .revealUpdateDownload()
               .catch((error: unknown) => reportError("Couldn't show the download", error, "Try again later."));
         },
      }),
      [availableUpdate, beforeRestart, reportError]
   );

   return { availableUpdate, updateActions, updateStatus: state.status, state, checkForUpdates, checkOnStartup, setCheckOnStartup, appVersion };
};

export type AppUpdates = ReturnType<typeof useAppUpdates>;
