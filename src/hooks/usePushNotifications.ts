import { useEffect, useState } from "react";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/services/firebase";

const VAPID_KEY = "BGZhAyCl7JCK7asSIkGVrc29ey8-4hPb18Rd51ygp78lmmR16YOdL9T2xgphOfDn0EEAcJy_FgpuwbENwEE5zWw";

export function usePushNotifications(supervisorId: string | null) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [token, setToken]           = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPermission(Notification.permission);
    }
  }, []);

  async function requestPermission() {
    if (!supervisorId) { setError("Debes estar autenticado"); return; }
    if (typeof window === "undefined" || !("Notification" in window)) {
      setError("Tu navegador no soporta notificaciones"); return;
    }
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") { setError("Permiso de notificaciones denegado"); return; }

      const messaging = getMessaging();
      const fcmToken  = await getToken(messaging, { vapidKey: VAPID_KEY });
      setToken(fcmToken);

      await updateDoc(doc(db, "personnel", supervisorId), { fcmToken });
      setError(null);

      onMessage(messaging, (payload) => {
        const { title = "Visita programada", body = "" } = payload.notification ?? {};
        new Notification(title, { body, icon: "/icon-192.png" });
      });
    } catch (e) {
      console.error(e);
      setError("No se pudo activar notificaciones. Verifica los permisos del navegador.");
    }
  }

  return { permission, token, error, requestPermission };
}