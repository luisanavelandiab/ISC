"use client";

import { useState } from "react";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useRouter } from "next/navigation";

export default function NewUnitPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [dayQty, setDayQty] = useState(1);
  const [nightQty, setNightQty] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !address) {
      alert("Completa todos los campos");
      return;
    }

    setLoading(true);

    try {
      await addDoc(collection(db, "units"), {
        name,
        address,
        status: "active",
        requiredPositions: [
          { shiftType: "dia", quantity: dayQty },
          { shiftType: "noche", quantity: nightQty },
        ],
        createdAt: Timestamp.now(),
      });

      router.push("/admin/units");
    } catch (error) {
      console.error("Error creando unidad:", error);
      alert("Error al crear la unidad");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="card" style={{ maxWidth: 520 }}>
        <h1 className="page-title">Crear Nueva Unidad</h1>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Nombre</label>
            <br />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-row">
            <label>Dirección</label>
            <br />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-row">
            <label>Vigilantes turno día</label>
            <br />
            <input
              type="number"
              value={dayQty}
              min={0}
              onChange={(e) => setDayQty(Number(e.target.value))}
              className="form-input"
            />
          </div>

          <div className="form-row">
            <label>Vigilantes turno noche</label>
            <br />
            <input
              type="number"
              value={nightQty}
              min={0}
              onChange={(e) => setNightQty(Number(e.target.value))}
              className="form-input"
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? "Guardando..." : "Crear Unidad"}
          </button>
        </form>
      </div>
    </div>
  );
}
