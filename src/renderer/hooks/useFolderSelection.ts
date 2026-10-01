import { useState } from "react";
import type { DragEvent } from "react";
import type { ConfirmAction } from "../appTypes.js";
import type { NotificationInput } from "./useNotifications.js";
import { createConfirmAction } from "../reviewModel.js";

interface FolderSelectionOptions {
   /** True while a saved review exists, so switching folders deserves a warning. */
   hasReview: boolean;
   confirmMajorActions: boolean;
   setConfirmAction: (action: ConfirmAction | null) => void;
   startScan: (folderPath: string | null) => Promise<void>;
   setIsStartupOpen: (open: boolean) => void;
   notify: (notification: NotificationInput) => void;
   reportError: (title: string, error: unknown, fallback: string) => void;
}

/**
 * How a folder gets chosen: the folder dialog, the drag-and-drop path, and the
 * switch-folder warning in between.
 */
export const useFolderSelection = ({
   hasReview,
   confirmMajorActions,
   setConfirmAction,
   startScan,
   setIsStartupOpen,
   notify,
   reportError,
}: FolderSelectionOptions) => {
   const [isDragOver, setIsDragOver] = useState(false);

   const chooseScanFolder = async (): Promise<string | null> => {
      try {
         return await window.imageDeduplicator.chooseFolder();
      } catch (error: unknown) {
         reportError("Couldn’t choose a folder", error, "Failed to choose a folder");
         return null;
      }
   };

   const confirmOrScan = (folderPath: string | null): void => {
      if (folderPath === null) return;
      if (hasReview && confirmMajorActions) {
         setConfirmAction(createConfirmAction("switchFolder", { folderPath }));
         return;
      }
      setIsStartupOpen(false);
      void startScan(folderPath);
   };

   const openNewFolder = async (): Promise<void> => {
      confirmOrScan(await chooseScanFolder());
   };

   const handleDragOver = (event: DragEvent): void => {
      event.preventDefault();
      setIsDragOver(true);
   };

   const handleDragLeave = (event: DragEvent): void => {
      if (event.currentTarget === event.target) setIsDragOver(false);
   };

   const handleDrop = (event: DragEvent): void => {
      event.preventDefault();
      setIsDragOver(false);
      const file = event.dataTransfer.files.item(0);
      if (file === null) return;
      const folderPath = window.imageDeduplicator.getPathForFile(file);
      if (folderPath.length === 0) {
         notify({ tone: "warning", title: "Nothing to scan", message: "Drop a folder from Explorer to scan it." });
         return;
      }
      confirmOrScan(folderPath);
   };

   return { isDragOver, openNewFolder, handleDragOver, handleDragLeave, handleDrop };
};
