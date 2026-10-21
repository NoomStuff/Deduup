import { createPortal } from "react-dom";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import type { AppNotification } from "../hooks/useNotifications.js";
import "./NotificationCenter.css";

const NotificationIcon = ({ tone }: { tone: AppNotification["tone"] }) => {
   if (tone === "success") return <CircleCheck aria-hidden="true" />;
   if (tone === "info") return <Info aria-hidden="true" />;
   return <TriangleAlert aria-hidden="true" />;
};

export const NotificationCenter = ({
   notifications,
   onDismiss,
   hold = false,
}: {
   notifications: AppNotification[];
   onDismiss: (id: number) => void;
   hold?: boolean;
}) => {
   // While a blocking surface holds the screen, the whole column rises to the
   // titlebar band, where no panel or safety footer can sit under it.
   const raised = hold || notifications.some((notification) => notification.elevated === true);
   return createPortal(
      <aside aria-label="Notifications" className={`notificationCenter${raised ? " notificationCenter--raised" : ""}`}>
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
               <button
                  aria-label={`Dismiss ${notification.title}`}
                  className="notificationToast__dismiss"
                  onClick={() => onDismiss(notification.id)}
                  type="button"
               >
                  <X aria-hidden="true" />
               </button>
            </section>
         ))}
      </aside>,
      document.body
   );
};
