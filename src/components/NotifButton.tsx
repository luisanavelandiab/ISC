/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

interface NotifButtonProps {
  supervisorId: string;
}

export function NotifButton({ supervisorId }: NotifButtonProps) {
  async function activarNotificaciones() {
    try {
      const OneSignal = (window as any).OneSignal;
      if (!OneSignal) { alert("OneSignal no está cargado aún, intenta de nuevo."); return; }

      await OneSignal.Notifications.requestPermission();

      // Vincular el supervisor con su ID para enviarle notificaciones personalizadas
      await OneSignal.login(supervisorId);
    } catch (e) {
      console.error(e);
    }
  }

  const permiso = typeof window !== "undefined"
    ? (window as any).OneSignal?.Notifications?.permission
    : false;

  if (permiso) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#81C784" }}>
        <span>🔔 Notificaciones activadas</span>
      </div>
    );
  }

  return (
    <button
      onClick={activarNotificaciones}
      style={{
        padding: "10px 18px",
        background: "rgba(201,168,76,.08)",
        border: "1px solid rgba(201,168,76,.3)",
        color: "#C9A84C",
        fontFamily: "'Montserrat', sans-serif",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "2px",
        textTransform: "uppercase",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      🔔 Activar notificaciones
    </button>
  );
}