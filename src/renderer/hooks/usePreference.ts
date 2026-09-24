import { useCallback, useEffect, useState } from "react";

export const preferenceKeys = {
   confirmMajorActions: "confirm-major-actions",
   imageCaptions: "image-captions",
   reviewHintsDismissed: "review-hints-dismissed",
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

/** A string preference constrained to a fixed set of values; anything else stored
   under the key falls back. */
export const useEnumPreference = <T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] => {
   const [value, setValue] = useState<T>(() => {
      const stored = window.localStorage.getItem(key);
      return stored !== null && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback;
   });
   const update = useCallback(
      (next: T): void => {
         setValue(next);
         window.localStorage.setItem(key, next);
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
