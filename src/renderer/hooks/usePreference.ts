import { useCallback, useState } from "react";

export const preferenceKeys = {
   confirmMajorActions: "confirm-major-actions",
   neutralTheme: "neutral-gray-theme",
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
