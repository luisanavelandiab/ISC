import { NextRequest, NextResponse } from "next/server";

const ONESIGNAL_APP_ID  = "4ac9b789-b178-48fd-b700-82478cc9c68e";
const ONESIGNAL_API_KEY = "os_v2_app_jle3pcnrpbep3nyaqjdyzsogr27ftaevzigeiknie63iwc7acpq2eqxww4mciqnoq7biprfyn2zdcv6rreotaqlk6rpegefhtxo5q2q";

export async function POST(req: NextRequest) {
  try {
    const { titulo, mensaje, destinatarios } = await req.json();

    if (!titulo || !mensaje || !destinatarios) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    // destinatarios puede ser:
    // "todos"         → enviar a todos los suscritos
    // ["id1","id2"]   → enviar a supervisores específicos por su external_id

    const body: Record<string, unknown> = {
      app_id:   ONESIGNAL_APP_ID,
      headings: { es: titulo,  en: titulo  },
      contents: { es: mensaje, en: mensaje },
      url:      "https://isc-qfef.vercel.app/admin/visitas",
    };

    if (destinatarios === "todos") {
      body.included_segments = ["Total Subscriptions"];
    } else if (Array.isArray(destinatarios) && destinatarios.length > 0) {
      body.include_aliases    = { external_id: destinatarios };
      body.target_channel     = "push";
    } else {
      return NextResponse.json({ error: "Sin destinatarios válidos" }, { status: 400 });
    }

    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Key ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("OneSignal error:", data);
      return NextResponse.json({ error: data.errors?.[0] || "Error de OneSignal" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id, recipients: data.recipients });

  } catch (e) {
    console.error("Error en send-notification:", e);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}