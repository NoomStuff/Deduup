import path from "node:path";
import { duplicateContainerFolderName, managedDuplicateFolderName } from "../shared/constants.js";

/** The app-owned folder inside a scan root that receives moved images. */
export const getManagedFolderPath = (scanRoot: string): string => path.join(scanRoot, duplicateContainerFolderName, managedDuplicateFolderName);

/** Lexical containment: true when candidate is root itself or sits below it. */
export const isPathInside = (root: string, candidate: string): boolean => {
   const relative = path.relative(root, path.resolve(candidate));
   return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
