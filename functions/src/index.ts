import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

admin.initializeApp();
const db  = admin.firestore();
const fcm = admin.messaging();

// ── 1. Lunes 8 AM: recordatorio semanal ──
export const weeklyVisitReminder = onSchedule("0 8 * * 1", async () => {
  const now      = new Date();
  const isoYear  = now.getFullYear();
  const jan4     = new Date(Date.UTC(isoYear, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday1  = new Date(Date.UTC(isoYear, 0, 4 - dayOfWeek + 1));
  const weekNum  = Math.round((now.getTime() - monday1.getTime()) / (7 * 86400000)) + 1;
  const semana   = `${isoYear}-W${String(weekNum).padStart(2, "0")}`;

  const snap = await db.collection("visitas_programadas")
    .where("semana", "==", semana)
    .where("estado", "==", "Pendiente")
    .get();

  const bySuper: Record<string, { name: string; units: string[]; token?: string }> = {};
  for (const d of snap.docs) {
    const data = d.data();
    if (!bySuper[data.supervisorId]) {
      bySuper[data.supervisorId] = { name: data.supervisorName, units: [] };
    }
    bySuper[data.supervisorId].units.push(data.unitName);
  }

  const supIds = Object.keys(bySuper);
  if (supIds.length === 0) return;

  const persSnap = await db.collection("personnel")
    .where(admin.firestore.FieldPath.documentId(), "in", supIds.slice(0, 30))
    .get();
  persSnap.forEach(d => {
    if (bySuper[d.id]) bySuper[d.id].token = d.data().fcmToken;
  });

  const messages: admin.messaging.Message[] = [];
  for (const sup of Object.values(bySuper)) {
    if (!sup.token) continue;
    const unidades = sup.units.length === 1
      ? sup.units[0]
      : `${sup.units.slice(0, -1).join(", ")} y ${sup.units.at(-1)}`;
    messages.push({
      token: sup.token,
      notification: {
        title: "🗓 Visitas pendientes esta semana",
        body: `Tienes ${sup.units.length} visita(s) programadas: ${unidades}.`,
      },
      data: { url: "/admin/visitas" },
      webpush: { fcmOptions: { link: "/admin/visitas" } },
    });
  }

  if (messages.length > 0) {
    const result = await fcm.sendEach(messages);
    console.log(`Enviadas: ${result.successCount}/${messages.length}`);
  }
});

// ── 2. Recordatorio el día anterior (20:00 cada noche) ──
export const dailyVisitReminder = onSchedule("0 20 * * *", async () => {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const start = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate()));
  const end   = new Date(start.getTime() + 86400000);

  const snap = await db.collection("visitas_programadas")
    .where("fechaProgramada", ">=", admin.firestore.Timestamp.fromDate(start))
    .where("fechaProgramada", "<",  admin.firestore.Timestamp.fromDate(end))
    .where("estado", "==", "Pendiente")
    .get();

  const messages: admin.messaging.Message[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    const persDoc = await db.collection("personnel").doc(data.supervisorId).get();
    const token   = persDoc.data()?.fcmToken;
    if (!token) continue;

    const hora = (data.fechaProgramada as admin.firestore.Timestamp)
      .toDate()
      .toLocaleTimeString("es-ES", {
        hour: "2-digit", minute: "2-digit",
        timeZone: "America/Lima",
      });

    messages.push({
      token,
      notification: {
        title: `📍 Mañana: visita a ${data.unitName}`,
        body:  `Recuerda tu visita para mañana a las ${hora}.`,
      },
      data: { url: "/admin/visitas" },
      webpush: { fcmOptions: { link: "/admin/visitas" } },
    });
  }

  if (messages.length > 0) {
    const result = await fcm.sendEach(messages);
    console.log(`Recordatorios enviados: ${result.successCount}/${messages.length}`);
  }
});

// ── 3. Notificación inmediata al crear una visita ──
export const onVisitaProgramada = onDocumentCreated(
  "visitas_programadas/{visitaId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const persDoc = await db.collection("personnel").doc(data.supervisorId).get();
    const token   = persDoc.data()?.fcmToken;
    if (!token) return;

    const fecha = (data.fechaProgramada as admin.firestore.Timestamp)
      .toDate()
      .toLocaleDateString("es-ES", {
        weekday: "long", day: "numeric", month: "long",
        timeZone: "America/Lima",
      });

    await fcm.send({
      token,
      notification: {
        title: `🏢 Nueva visita asignada: ${data.unitName}`,
        body:  `Programada para el ${fecha}.`,
      },
      data: { url: "/admin/visitas" },
      webpush: { fcmOptions: { link: "/admin/visitas" } },
    });
  }
);