import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LoadDataResult, ScanProgress } from "../../shared/types.js";
import type { NotificationInput } from "./useNotifications.js";

interface ScanControllerOptions {
   notify: (notification: NotificationInput) => void;
   onScanApplied: (result: LoadDataResult) => void;
   reportError: (title: string, error: unknown, fallback: string) => void;
}

/** Owns the scan lifecycle: progress bridging, start, and cancel. */
export const useScanController = ({ notify, onScanApplied, reportError }: ScanControllerOptions) => {
   const [isScanning, setIsScanning] = useState(false);
   const [scanningPath, setScanningPath] = useState<string | null>(null);
   const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
   const cancelRequestedRef = useRef(false);
   // Assignments go through these helpers so the ref's type never narrows.
   const requestCancel = (): void => {
      cancelRequestedRef.current = true;
   };
   const clearCancelRequest = (): boolean => {
      const wasRequested = cancelRequestedRef.current;
      cancelRequestedRef.current = false;
      return wasRequested;
   };
   const callbacksRef = useRef({ notify, onScanApplied, reportError });
   useLayoutEffect(() => {
      callbacksRef.current = { notify, onScanApplied, reportError };
   });

   // The event bridges attach once; callbacks stay fresh through the ref.
   useEffect(() => {
      const api = window.imageDeduplicator;
      const unsubscribeProgress = api.onScanProgress((progress) => {
         setIsScanning(true);
         setScanProgress(progress);
      });
      const unsubscribeComplete = api.onScanComplete((result) => {
         callbacksRef.current.onScanApplied(result);
         setIsScanning(false);
         setScanningPath(null);
      });
      const unsubscribeError = api.onAppError((message) => {
         setIsScanning(false);
         setScanningPath(null);
         callbacksRef.current.notify({ tone: "error", title: "Scan failed", message });
      });
      return () => {
         unsubscribeProgress();
         unsubscribeComplete();
         unsubscribeError();
      };
   }, []);

   const startScan = async (rootPath: string | null): Promise<void> => {
      if (rootPath === null) return;
      clearCancelRequest();
      setIsScanning(true);
      setScanningPath(rootPath);
      setScanProgress({ phase: "discovering", completed: 0, total: 0 });
      try {
         const result = await window.imageDeduplicator.scanFolder({ rootPath });
         // The scan can outlive the cancel click: if saving already happened on
         // the main side, its result is authoritative and still gets applied.
         if (clearCancelRequest()) {
            notify({ tone: "info", title: "Scan finished", message: "The cancel arrived after the scan completed." });
         }
         onScanApplied(result);
      } catch (error: unknown) {
         if (cancelRequestedRef.current) {
            notify({ tone: "info", title: "Scan cancelled", message: "The saved review is untouched." });
         } else {
            reportError("Scan failed", error, "Failed to scan the selected folder");
         }
      } finally {
         setIsScanning(false);
         setScanningPath(null);
      }
   };

   const cancelScan = (): void => {
      requestCancel();
      void window.imageDeduplicator.cancelScan().catch(() => undefined);
   };

   return { cancelScan, isScanning, scanProgress, scanningPath, startScan };
};
