/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/create-user/route.ts

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    // Import dinámico para evitar problemas de inicialización en dev
    const { adminAuth, adminDb } = await import("@/lib/firebaseAdmin");

    // ── 1. Verificar token del admin ──────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No autorizado — falta token" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];

    let decoded: any;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch (e: any) {
      return NextResponse.json(
        { error: "Token inválido o expirado. Recarga la página e intenta de nuevo." },
        { status: 401 }
      );
    }

    // Verificar rol del admin que hace la petición
    const callerDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!callerDoc.exists) {
      return NextResponse.json(
        { error: `Tu usuario (${decoded.uid}) no tiene doc en Firestore/users. Créalo manualmente.` },
        { status: 403 }
      );
    }

    const callerRole = callerDoc.data()?.role;
    if (callerRole !== "admin" && callerRole !== "coordinador") {
      return NextResponse.json(
        { error: `Tu rol es "${callerRole}". Solo admin o coordinador pueden crear usuarios.` },
        { status: 403 }
      );
    }

    // ── 2. Leer payload ───────────────────────────────────────────────────
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const { email, password, personnelData } = body;

    if (!email || !password || !personnelData) {
      return NextResponse.json({ error: "Faltan campos: email, password o personnelData" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    // ── 3. Crear usuario en Firebase Auth ─────────────────────────────────
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: personnelData.fullName || "",
      disabled: false,
    });
    const uid = userRecord.uid;

    // Custom claim de rol
    await adminAuth.setCustomUserClaims(uid, {
      role: personnelData.authRole || "vigilante",
    });

    // ── 4. Crear doc en personnel ─────────────────────────────────────────
    const personnelRef = await adminDb.collection("personnel").add({
      ...personnelData,
      uid,
      email,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const personnelId = personnelRef.id;

    // Guardar el propio ID en el doc
    await personnelRef.update({ guardId: personnelId });

    // ── 5. Crear doc en users/{uid} ───────────────────────────────────────
    await adminDb.collection("users").doc(uid).set({
      email,
      displayName:  personnelData.fullName || "",
      role:         personnelData.authRole  || "vigilante",
      guardId:      personnelId,
      personnelId:  personnelId,
      active:       true,
      createdAt:    FieldValue.serverTimestamp(),
    });

    // ── 6. Éxito ──────────────────────────────────────────────────────────
    return NextResponse.json({ success: true, uid, personnelId });

  } catch (error: any) {
    console.error("[create-user] Error:", error?.code, error?.message);

    const firebaseErrors: Record<string, string> = {
      "auth/email-already-exists": "Este correo ya está registrado en Firebase.",
      "auth/invalid-email":        "El correo electrónico no es válido.",
      "auth/weak-password":        "La contraseña es demasiado débil (mín. 6 caracteres).",
    };

    const msg = firebaseErrors[error?.code] || error?.message || "Error interno del servidor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}