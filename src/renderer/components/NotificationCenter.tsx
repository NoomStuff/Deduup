import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import type { AppNotification } from "../hooks/useNotifications.js";

const NotificationIcon = ({ tone }: { tone: AppNotification["tone"] }) => {
   if (tone === "success") return <CircleCheck aria-hidden="true" />;
   if (tone === "info") return <Info aria-hidden="true" />;
   return <TriangleAlert aria-hidden="true" />;
};

export const NotificationCenter = ({
   notifications,
   onDismiss,
}: {
   notifications: AppNotification[];
   onDismiss: (id: number) => void;
}) => (
   <aside aria-label="Notifications" className="notificationCenter">
      {notifications.map((notification) => (
         <section
            className={`notificationToast notificationToast--${notification.tone}`}
            key={notification.id}
            role={notification.tone === "error" || notification.tone === "warning" ? "alert" : "status"}
         >
            <span className="notificationToast__icon">
               <NotificationIcon tone={notification.tone} />
            </span>
            <span className="notificationToast__copy">
               <strong>{notification.title}</strong>
               <span>{notification.message}</span>
            </span>
            <button aria-label={`Dismiss ${notification.title}`} className="notificationToast__dismiss" onClick={() => onDismiss(notification.id)} type="button">
               <X aria-hidden="true" />
            </button>
         </section>
      ))}
   </aside>
);
