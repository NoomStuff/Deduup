import { useCallback, useEffect, useRef, useState } from "react";

export type NotificationTone = "error" | "warning" | "success" | "info";

export interface AppNotification {
   id: number;
   tone: NotificationTone;
   title: string;
   message: string;
}

export interface NotificationInput {
   tone: NotificationTone;
   title: string;
   message: string;
   timeoutMs?: number;
}

export const useNotifications = (): {
   notifications: AppNotification[];
   notify: (notification: NotificationInput) => void;
   dismissNotification: (id: number) => void;
} => {
   const [notifications, setNotifications] = useState<AppNotification[]>([]);
   const nextIdRef = useRef(1);
   const timersRef = useRef(new Map<number, number>());

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
         const notification: AppNotification = { id, tone: input.tone, title: input.title, message: input.message };
         setNotifications((current) => [...current.slice(-3), notification]);
         const timeoutMs = input.timeoutMs ?? (input.tone === "error" ? 9_000 : 5_000);
         if (timeoutMs > 0) {
            timersRef.current.set(
               id,
               window.setTimeout(() => dismissNotification(id), timeoutMs)
            );
         }
      },
      [dismissNotification]
   );

   useEffect(
      () => () => {
         for (const timer of timersRef.current.values()) window.clearTimeout(timer);
         timersRef.current.clear();
      },
      []
   );

   return { notifications, notify, dismissNotification };
};
