import { useCallback, useEffect, useRef, useState } from "react";

export type NotificationTone = "error" | "warning" | "success" | "info";

export interface AppNotification {
   id: number;
   tone: NotificationTone;
   title: string;
   message: string;
   /** Alerts created while the screen is held render in the raised column. */
   elevated?: boolean;
}

export interface NotificationInput {
   tone: NotificationTone;
   title: string;
   message: string;
   timeoutMs?: number;
}

const isAlert = (tone: NotificationTone): boolean => tone === "error" || tone === "warning";

/**
 * Owns the toast queue. While a blocking surface holds the screen
 * (`holdWhile`; the final review with its safety footer), quiet outcomes
 * (success/info) queue and land after it closes, and alerts show immediately
 * in the raised column, clear of the panel. Queued notes get a fresh window
 * when they finally display.
 */
export const useNotifications = (
   holdWhile = false
): {
   notifications: AppNotification[];
   notify: (notification: NotificationInput) => void;
   dismissNotification: (id: number) => void;
} => {
   const [notifications, setNotifications] = useState<AppNotification[]>([]);
   const nextIdRef = useRef(1);
   const timersRef = useRef(new Map<number, number>());
   const heldRef = useRef<AppNotification[]>([]);

   const dismissNotification = useCallback((id: number): void => {
      const timer = timersRef.current.get(id);
      if (timer !== undefined) window.clearTimeout(timer);
      timersRef.current.delete(id);
      setNotifications((current) => current.filter((notification) => notification.id !== id));
   }, []);

   const notify = useCallback(
      (input: NotificationInput): void => {
         const id = nextIdRef.current;
         nextIdRef.current += 1;
         const notification: AppNotification = {
            id,
            tone: input.tone,
            title: input.title,
            message: input.message,
            elevated: holdWhile && isAlert(input.tone),
         };
         if (holdWhile && !isAlert(input.tone)) {
            heldRef.current = [...heldRef.current.slice(-3), notification];
            return;
         }
         setNotifications((current) => [...current.slice(-3), notification]);
         const timeoutMs = input.timeoutMs ?? (input.tone === "error" ? 9_000 : 5_000);
         if (timeoutMs > 0) {
            timersRef.current.set(
               id,
               window.setTimeout(() => dismissNotification(id), timeoutMs)
            );
         }
      },
      [holdWhile, dismissNotification]
   );

   // Release queued quiet outcomes once the blocking surface is gone.
   useEffect(() => {
      if (holdWhile || heldRef.current.length === 0) return undefined;
      const flushed = heldRef.current.map((notification) => ({ ...notification, elevated: false }));
      heldRef.current = [];
      setNotifications((current) => [...current, ...flushed].slice(-4));
      for (const notification of flushed) {
         timersRef.current.set(
            notification.id,
            window.setTimeout(() => dismissNotification(notification.id), 5_000)
         );
      }
      return undefined;
   }, [holdWhile, dismissNotification]);

   useEffect(
      () => () => {
         for (const timer of timersRef.current.values()) window.clearTimeout(timer);
         timersRef.current.clear();
         heldRef.current = [];
      },
      []
   );

   return { notifications, notify, dismissNotification };
};
