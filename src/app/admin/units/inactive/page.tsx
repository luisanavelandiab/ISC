"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import Link from "next/link";
import { db } from "@/services/firebase";

interface RequiredPosition { shiftType: string; quantity: number; }
interface ScheduleConfig { [key: string]: unknown; }
interface Unit {
  id: string; name: string; address: string; status: string;
  shiftType?: string; requiredPositions?: RequiredPosition[];
  restDay?: number; rotation?: boolean; scheduleConfig?: ScheduleConfig;
}

const SHIFT_LABELS: Record<string, string> = {
  A: "7×0 Permanente", B: "6×1 Individual", C: "6×1 Común",
  D: "4×2 Rotativo",   E: "1 Fijo + 2 Rotativos",
};
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function InactiveUnitsPage() {
  const [units,   setUnits]   = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "units"), snap => {
      setUnits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Unit)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function handleReactivate(id: string) {
    try {
      await updateDoc(doc(db, "units", id), { status: "Activo" });
    } catch (err) {
      console.error("Error reactivando unidad:", err);
    } finally {
      setConfirm(null);
    }
  }

  const inactiveUnits = units.filter(u => u.status !== "Activo");

  if (loading) return (
    <div className="up-page">
      <div className="up-loading"><div className="up-spinner" /><span>Cargando…</span></div>
    </div>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="up-page">

        <div className="up-header">
          <div>
            <p className="up-eye">Gestión de unidades</p>
            <h1 className="up-title">Unidades <span>Desactivadas</span></h1>
          </div>
          <Link href="/admin/units">
            <button className="btn-sec">← Volver a unidades activas</button>
          </Link>
        </div>

        {inactiveUnits.length === 0 ? (
          <div className="up-empty">
            <p>No hay unidades desactivadas.</p>
            <Link href="/admin/units"><button className="btn-sec">← Volver</button></Link>
          </div>
        ) : (
          <div className="up-table-wrap">
            <table className="up-table">
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Dirección</th>
                  <th>Turno</th>
                  <th>Posiciones</th>
                  <th>Descanso</th>
                  <th>Rotación</th>
                  <th>Config.</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {inactiveUnits.map(unit => (
                  <tr key={unit.id} className="tr-inactive">
                    <td className="td-name">
                      <Link href={`/admin/units/${unit.id}`} className="unit-link">
                        {unit.name}
                      </Link>
                    </td>
                    <td className="td-address">{unit.address || <span className="td-empty">—</span>}</td>
                    <td>
                      {unit.shiftType
                        ? <span className="badge badge-shift">{unit.shiftType} — {SHIFT_LABELS[unit.shiftType] ?? unit.shiftType}</span>
                        : <span className="td-empty">—</span>}
                    </td>
                    <td>
                      {unit.requiredPositions?.length
                        ? <div className="pos-list">{unit.requiredPositions.map((p, i) => <span key={i} className="badge badge-pos">{p.shiftType}: {p.quantity}</span>)}</div>
                        : <span className="td-empty">—</span>}
                    </td>
                    <td>
                      {unit.restDay !== undefined
                        ? <span className="badge badge-rest">{DAY_NAMES[unit.restDay]}</span>
                        : <span className="td-empty">—</span>}
                    </td>
                    <td>{unit.rotation !== undefined
                      ? <span className={`badge ${unit.rotation ? "badge-rot-on" : "badge-rot-off"}`}>{unit.rotation ? "Sí" : "No"}</span>
                      : <span className="td-empty">—</span>}
                    </td>
                    <td className="td-config">
                      {unit.scheduleConfig && Object.keys(unit.scheduleConfig).length > 0
                        ? <div className="config-list">
                            {Object.entries(unit.scheduleConfig).map(([k, v]) => (
                              <span key={k} className="badge badge-config">
                                {k}: {String(v)}
                              </span>
                            ))}
                          </div>
                        : <span className="td-empty">—</span>}
                    </td>
                    <td><span className="badge badge-inactive">● Inactivo</span></td>
                    <td className="td-actions">
                      <button className="btn-icon btn-icon-success" title="Reactivar" onClick={() => setConfirm(unit.id)}>✅</button>
                      <Link href={`/admin/units/${unit.id}`}>
                        <button className="btn-icon" title="Ver detalle">✏️</button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {confirm && (() => {
          const unit = units.find(u => u.id === confirm);
          return (
            <div className="modal-overlay" onClick={() => setConfirm(null)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-icon">✅</div>
                <h3 className="modal-title">¿Reactivar unidad?</h3>
                <p className="modal-desc">
                  La unidad <strong>{unit?.name}</strong> volverá a aparecer como activa
                  y será incluida en la planificación automática.
                </p>
                <div className="modal-actions">
                  <button className="btn-pri btn-success" onClick={() => handleReactivate(confirm)}>Sí, reactivar</button>
                  <button className="btn-sec" onClick={() => setConfirm(null)}>Cancelar</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Montserrat:wght@300;400;500;600&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --gold: #C9A84C; --gold-light: #E8C97A;
  --black: #0A0A0A; --card: #141414;
  --white: #F5F0E8; --dim: rgba(245,240,232,.5);
  --border: rgba(201,168,76,.18);
  --danger: #E57373; --success: #81C784;
}
.up-page { background: var(--black); min-height: 100vh; font-family: 'Montserrat', sans-serif; color: var(--white); padding: 28px 20px 48px; }
.up-page::before { content: ''; position: fixed; inset: 0; background-image: linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px); background-size: 48px 48px; pointer-events: none; z-index: 0; }
.up-page > * { position: relative; z-index: 1; }
.up-eye { font-size: 9px; font-weight: 600; letter-spacing: 4px; text-transform: uppercase; color: var(--gold); margin-bottom: 4px; }
.up-title { font-family: 'Cormorant Garamond', serif; font-size: clamp(22px,5vw,34px); font-weight: 300; line-height: 1.1; margin-bottom: 0; }
.up-title span { color: var(--danger); font-style: italic; font-weight: 600; }
.up-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 28px; }
.btn-pri { background: var(--gold); color: var(--black); border: none; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; padding: 10px 18px; cursor: pointer; transition: opacity .2s; white-space: nowrap; }
.btn-pri:hover { opacity: .85; }
.btn-success { background: var(--success); }
.btn-sec { background: var(--card); color: var(--dim); border: 1px solid var(--border); font-family: 'Montserrat', sans-serif; font-size: 11px; padding: 10px 16px; cursor: pointer; transition: border-color .2s, color .2s; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.btn-sec:hover { border-color: var(--gold); color: var(--white); }
.btn-icon { background: none; border: 1px solid var(--border); color: var(--dim); width: 30px; height: 30px; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; transition: all .2s; }
.btn-icon:hover { border-color: var(--gold); background: rgba(201,168,76,.08); }
.btn-icon-success:hover { border-color: var(--success); background: rgba(129,199,132,.08); }
.up-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); }
.up-table { width: 100%; border-collapse: collapse; min-width: 760px; background: var(--card); }
.up-table thead tr { background: rgba(201,168,76,.08); border-bottom: 1px solid var(--border); }
.up-table th { padding: 11px 12px; text-align: left; font-size: 9px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--gold); white-space: nowrap; }
.up-table tbody tr { border-bottom: 1px solid rgba(201,168,76,.06); transition: background .15s; }
.up-table tbody tr:hover { background: rgba(201,168,76,.04); }
.tr-inactive { opacity: .65; }
.up-table td { padding: 11px 12px; font-size: 12px; color: var(--white); vertical-align: middle; }
.td-name { font-weight: 500; min-width: 140px; }
.td-address { color: var(--dim); max-width: 180px; }
.td-config { color: var(--dim); font-size: 11px; max-width: 120px; }
.td-empty { color: rgba(245,240,232,.2); font-size: 11px; }
.td-actions { display: flex; gap: 6px; align-items: center; }
.unit-link { color: var(--white); text-decoration: none; border-bottom: 1px solid transparent; transition: border-color .2s, color .2s; }
.unit-link:hover { color: var(--gold-light); border-bottom-color: var(--gold); }
.badge { font-size: 9px; font-weight: 600; padding: 3px 8px; letter-spacing: .5px; display: inline-block; }
.badge-shift    { background: rgba(201,168,76,.12); color: var(--gold);   border: 1px solid rgba(201,168,76,.3); }
.badge-pos      { background: rgba(100,180,255,.1);  color: #7BC8FF;       border: 1px solid rgba(100,180,255,.25); margin-right: 3px; }
.badge-rest     { background: rgba(180,130,255,.1);  color: #C4A0FF;       border: 1px solid rgba(180,130,255,.25); }
.badge-inactive { background: rgba(229,115,115,.1);  color: var(--danger); border: 1px solid rgba(229,115,115,.3); }
.badge-rot-on  { background: rgba(129,199,132,.1);  color: #81C784; border: 1px solid rgba(129,199,132,.3); }
.badge-rot-off { background: rgba(150,150,150,.1);  color: #888;    border: 1px solid rgba(150,150,150,.2); }
.badge-config  { background: rgba(180,130,255,.08); color: #C4A0FF; border: 1px solid rgba(180,130,255,.2); margin-bottom: 2px; }
.config-list   { display: flex; flex-direction: column; gap: 2px; }
.up-loading { display: flex; align-items: center; gap: 12px; padding: 60px 20px; color: var(--dim); font-size: 13px; }
.up-spinner { width: 18px; height: 18px; border: 2px solid var(--border); border-top-color: var(--gold); border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
.up-empty { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 60px 20px; color: var(--dim); text-align: center; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 10000; padding: 16px; }
.modal { background: #161625; border: 1px solid rgba(129,199,132,.25); padding: 32px 28px; width: 100%; max-width: 380px; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.8); }
.modal-icon { font-size: 36px; }
.modal-title { font-family: 'Cormorant Garamond', serif; font-size: 24px; font-weight: 300; color: var(--white); }
.modal-desc { font-size: 12px; color: var(--dim); line-height: 1.6; }
.modal-desc strong { color: var(--white); }
.modal-actions { display: flex; gap: 8px; width: 100%; }
.modal-actions .btn-pri, .modal-actions .btn-sec { flex: 1; justify-content: center; }
@media (max-width: 600px) {
  .up-page { padding: 16px 12px 40px; }
  .up-header { flex-direction: column; }
  .btn-sec { width: 100%; }
}
`;