import path from "node:path";
import { duplicateContainerFolderName, managedDuplicateFolderName } from "../shared/constants.js";

export const getManagedFolderPaths = (scanRoot: string): { containerPath: string; managedPath: string } => {
   const containerPath = path.join(scanRoot, duplicateContainerFolderName);
   return { containerPath, managedPath: path.join(containerPath, managedDuplicateFolderName) };
};
