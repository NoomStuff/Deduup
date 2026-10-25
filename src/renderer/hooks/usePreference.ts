import { useCallback, useEffect, useState } from "react";

export const preferenceKeys = {
   checkForUpdates: "check-for-updates-at-startup",
   confirmMajorActions: "confirm-major-actions",
   showStartupOnLaunch: "show-start-screen-on-startup",
   wrapImageShelf: "wrap-image-shelf",
} as const;

const readStoredFlag = (key: string, fallback: boolean): boolean => {
   const value = window.localStorage.getItem(key);
   return value === null ? fallback : value === "true";
};

/** A boolean preference that persists to localStorage, so settings survive a restart. */
export const usePreference = (key: string, fallback: boolean): [boolean, (value: boolean) => void] => {
   const [value, setValue] = useState(() => readStoredFlag(key, fallback));
   const update = useCallback(
      (next: boolean): void => {
         setValue(next);
         window.localStorage.setItem(key, String(next));
      },
      [key]
   );
   return [value, update];
};

/** True while the Ctrl key is physically held; used for the on-shelf number hints. */
export const useCtrlHeld = (): boolean => {
   const [held, setHeld] = useState(false);
   useEffect(() => {
      const sync = (event: KeyboardEvent | globalThis.FocusEvent): void => {
         setHeld(event.type === "blur" ? false : (event as KeyboardEvent).ctrlKey);
      };
      window.addEventListener("keydown", sync);
      window.addEventListener("keyup", sync);
      window.addEventListener("blur", sync);
      return () => {
         window.removeEventListener("keydown", sync);
         window.removeEventListener("keyup", sync);
         window.removeEventListener("blur", sync);
      };
   }, []);
   return held;
};
