"use client";

import { useEffect, useState, useCallback } from "react";
import {
  doc, getDoc, collection, getDocs, addDoc, setDoc,
  updateDoc, Timestamp, query, where,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useParams } from "next/navigation";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS as DndCSS } from "@dnd-kit/utilities";

// ─── Tipos ───────────────────────────────────────
interface Unit {
  name: string; address: string; status: string;
  requiredPositions: { shiftType: string; quantity: number }[];
}
interface Personnel { id: string; name: string; status: string; }
interface Assignment {
  id: string; personnelId: string; unitId: string;
  shiftType: string; patternType: string;
  startDate: Timestamp; endDate: Timestamp | null;
  status: string; personnelName: string;
}

// ─── Helpers de semana ───────────────────────────
function getMonday(d: Date) {
  const r = new Date(d); const day = r.getDay();
  r.setDate(r.getDate() - day + (day === 0 ? -6 : 1));
  r.setHours(0, 0, 0, 0); return r;
}
function getWeekDays(offset = 0): Date[] {
  const base = getMonday(new Date());
  base.setDate(base.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base); d.setDate(base.getDate() + i); return d;
  });
}
function dateKey(d: Date) { return d.toISOString().slice(0, 10); }
const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// ─── Drag & Drop ─────────────────────────────────
function DraggableCard({ assignment, onFinish }: { assignment: Assignment; onFinish: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: assignment.id });
  return (
    <div ref={setNodeRef} className={"asgn-card" + (isDragging ? " dragging" : "")}
      style={{ transform: DndCSS.Transform.toString(transform) }} {...listeners} {...attributes}>
      <span className="asgn-name">{assignment.personnelName}</span>
      <button className="asgn-finish" title="Finalizar" onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onFinish(assignment.id); }}>✕</button>
    </div>
  );
}

function ShiftColumn({ shift, assignments, draggingName, onFinish }: {
  shift: string; assignments: Assignment[]; draggingName?: string; onFinish: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: shift });
  const icons: Record<string, string>  = { dia: "☀️", noche: "🌙", "24h": "⏱️" };
  const labels: Record<string, string> = { dia: "Turno Día", noche: "Turno Noche", "24h": "24 Horas" };
  return (
    <div ref={setNodeRef} className={"shift-col" + (isOver ? " over" : "") + " shift-" + shift}>
      <div className="shift-col-head">
        <span className="shift-icon">{icons[shift] ?? "🔄"}</span>
        <span className="shift-label">{labels[shift] ?? shift.toUpperCase()}</span>
        <span className="shift-count">{assignments.length}</span>
      </div>
      <div className="shift-col-body">
        {isOver
          ? <div className="drop-placeholder">{draggingName ? `Mover — ${draggingName}` : "Soltar aquí"}</div>
          : assignments.length === 0
            ? <div className="shift-empty">Sin asignaciones</div>
            : assignments.map(a => <DraggableCard key={a.id} assignment={a} onFinish={onFinish} />)
        }
      </div>
    </div>
  );
}

// ─── Página principal ────────────────────────────
export default function UnitDetailPage() {
  const params = useParams();
  const unitId = params.id as string;
  const weekDays = getWeekDays();

  // ── Estado ──
  const [unit,           setUnit]           = useState<Unit | null>(null);
  const [personnel,      setPersonnel]      = useState<Personnel[]>([]);
  const [assignments,    setAssignments]    = useState<Assignment[]>([]);
  const [observations,   setObservations]   = useState<Record<string, string>>({});
  const [selectedPerson, setSelectedPerson] = useState("");
  const [shiftType,      setShiftType]      = useState("dia");
  const [draggingName,   setDraggingName]   = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [savingObs,      setSavingObs]      = useState<Record<string, boolean>>({});
  const [savedObs,       setSavedObs]       = useState<Record<string, boolean>>({});
  const [confirm,        setConfirm]        = useState<string | null>(null);

  // ── Fetch assignments ──
  const fetchAssignments = useCallback(async () => {
    const snap = await getDocs(query(
      collection(db, "assignments"),
      where("unitId", "==", unitId),
      where("status", "==", "activo"),
    ));
    const data = await Promise.all(snap.docs.map(async d => {
      const a = d.data();
      const pSnap = await getDoc(doc(db, "personnel", a.personnelId));
      return {
        id: d.id, personnelId: a.personnelId, unitId: a.unitId,
        shiftType: a.shiftType, patternType: a.patternType,
        startDate: a.startDate, endDate: a.endDate, status: a.status,
        personnelName: pSnap.exists() ? pSnap.data().name : "Desconocido",
      } as Assignment;
    }));
    setAssignments(data);
  }, [unitId]);

  // ── Fetch observations ──
  const fetchObservations = useCallback(async () => {
    const map: Record<string, string> = {};
    await Promise.all(weekDays.map(async day => {
      const key = dateKey(day);
      try {
        const snap = await getDoc(doc(db, "units", unitId, "observations", key));
        if (snap.exists()) map[key] = snap.data().text ?? "";
      } catch { /* no existe aún */ }
    }));
    setObservations(map);
  }, [unitId]); // eslint-disable-line

  // ── Save observation ──
  async function saveObservation(dateStr: string) {
    setSavingObs(p => ({ ...p, [dateStr]: true }));
    try {
      await setDoc(doc(db, "units", unitId, "observations", dateStr), {
        date: dateStr,
        text: observations[dateStr] ?? "",
        updatedAt: Timestamp.now(),
      });
      setSavedObs(p => ({ ...p, [dateStr]: true }));
      setTimeout(() => setSavedObs(p => ({ ...p, [dateStr]: false })), 2000);
    } catch (e) { console.error(e); }
    finally { setSavingObs(p => ({ ...p, [dateStr]: false })); }
  }

  // ── Initial load ──
  useEffect(() => {
    (async () => {
      try {
        const uSnap = await getDoc(doc(db, "units", unitId));
        if (uSnap.exists()) setUnit(uSnap.data() as Unit);
        const pSnap = await getDocs(collection(db, "personnel"));
        setPersonnel(pSnap.docs.map(d => ({ id: d.id, ...d.data() as Omit<Personnel, "id"> })));
        await fetchAssignments();
        await fetchObservations();
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [unitId, fetchAssignments, fetchObservations]);

  // ── Cobertura ──
  const coverage = () => (unit?.requiredPositions ?? []).map(req => ({
    shiftType: req.shiftType,
    required:  req.quantity,
    assigned:  assignments.filter(a => a.shiftType === req.shiftType).length,
    missing:   req.quantity - assignments.filter(a => a.shiftType === req.shiftType).length,
  }));

  const isShiftFull = () => {
    const c = coverage().find(c => c.shiftType === shiftType);
    return c ? c.missing <= 0 : false;
  };

  // ── Asignar ──
  async function handleAssign() {
    if (!selectedPerson) { alert("Selecciona un agente"); return; }
    if (isShiftFull())   { alert("🚫 Este turno ya está completamente cubierto"); return; }
    setSaving(true);
    try {
      const activeSnap = await getDocs(query(
        collection(db, "assignments"),
        where("personnelId", "==", selectedPerson),
        where("status", "==", "activo"),
      ));
      if (!activeSnap.empty) { alert("🚫 Este agente ya está asignado a otra unidad activa"); return; }
      await addDoc(collection(db, "assignments"), {
        personnelId: selectedPerson, unitId,
        shiftType, patternType: "fijo",
        startDate: Timestamp.now(), endDate: null, status: "activo",
      });
      setSelectedPerson("");
      await fetchAssignments();
    } catch (e) { console.error(e); alert("Error al asignar"); }
    finally { setSaving(false); }
  }

  // ── Finalizar ──
  async function handleFinish(id: string) {
    try {
      await updateDoc(doc(db, "assignments", id), { status: "finalizado", endDate: Timestamp.now() });
      await fetchAssignments();
    } catch (e) { console.error(e); }
    finally { setConfirm(null); }
  }

  // ── Cambiar turno (DnD) ──
  async function handleShiftChange(assignmentId: string, newShift: string) {
    try {
      await updateDoc(doc(db, "assignments", assignmentId), { shiftType: newShift });
      await fetchAssignments();
    } catch (e) { console.error(e); }
  }

  // ─── Render ──────────────────────────────────
  if (loading) return (
    <div className="udp">
      <div className="udp-loading"><div className="udp-spinner" /><span>Cargando unidad…</span></div>
    </div>
  );
  if (!unit) return <div className="udp"><div className="udp-loading">Unidad no encontrada.</div></div>;

  const cov = coverage();
  const totalRequired = cov.reduce((s, c) => s + c.required, 0);
  const totalAssigned = cov.reduce((s, c) => s + c.assigned, 0);
  const pct = totalRequired > 0 ? Math.round(totalAssigned / totalRequired * 100) : 0;

  return (
    <>
      <style>{CSS}</style>
      <div className="udp">

        {/* ── Header ── */}
        <div className="udp-header">
          <div>
            <p className="udp-eye">Detalle de unidad</p>
            <h1 className="udp-title">{unit.name}</h1>
            <p className="udp-addr">📍 {unit.address}</p>
          </div>
          <div className="udp-header-right">
            <span className={"status-badge " + (unit.status === "Activo" ? "status-active" : "status-inactive")}>
              ● {unit.status}
            </span>
            <div className="pct-ring">
              <svg viewBox="0 0 36 36" className="pct-svg">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(201,168,76,.1)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke={pct >= 90 ? "#81C784" : pct >= 50 ? "#C9A84C" : "#E57373"}
                  strokeWidth="3" strokeDasharray={`${pct} ${100 - pct}`}
                  strokeLinecap="round" transform="rotate(-90 18 18)" />
              </svg>
              <span className="pct-val">{pct}%</span>
            </div>
          </div>
        </div>

        {/* ── KPIs cobertura ── */}
        <div className="cov-row">
          {cov.map(c => {
            const p = c.required > 0 ? Math.round(c.assigned / c.required * 100) : 0;
            const cls = p >= 100 ? "cov-ok" : p > 0 ? "cov-partial" : "cov-miss";
            return (
              <div key={c.shiftType} className={"cov-card " + cls}>
                <div className="cov-shift">{c.shiftType === "dia" ? "☀️" : c.shiftType === "noche" ? "🌙" : "⏱️"} {c.shiftType.toUpperCase()}</div>
                <div className="cov-nums">{c.assigned}<span>/{c.required}</span></div>
                <div className="cov-bar"><div className="cov-fill" style={{ width: `${Math.min(p, 100)}%` }} /></div>
                {c.missing > 0 && <div className="cov-miss-lbl">Faltan {c.missing}</div>}
              </div>
            );
          })}
        </div>

        {/* ── Calendario DnD ── */}
        <p className="sec-lbl">Asignaciones activas</p>
        <DndContext
          onDragStart={e => setDraggingName(assignments.find(a => a.id === e.active.id)?.personnelName ?? null)}
          onDragEnd={e => {
            if (e.over && e.active.id !== e.over.id) handleShiftChange(e.active.id as string, e.over.id as string);
            setDraggingName(null);
          }}
        >
          <div className="shifts-grid">
            {["dia", "noche", "24h"].map(s => (
              <ShiftColumn key={s} shift={s}
                assignments={assignments.filter(a => a.shiftType === s)}
                draggingName={draggingName ?? undefined}
                onFinish={id => setConfirm(id)}
              />
            ))}
          </div>
        </DndContext>

        {/* ── Asignar vigilante ── */}
        <p className="sec-lbl" style={{ marginTop: 32 }}>Asignar agentes</p>
        <div className="assign-box">
          <select className="udp-select" value={selectedPerson} onChange={e => setSelectedPerson(e.target.value)}>
            <option value="">— Seleccionar agente —</option>
            {personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="udp-select udp-select-sm" value={shiftType} onChange={e => setShiftType(e.target.value)}>
            <option value="dia">☀️ Día</option>
            <option value="noche">🌙 Noche</option>
            <option value="24h">⏱️ 24h</option>
          </select>
          <button className="btn-assign" onClick={handleAssign} disabled={isShiftFull() || saving}>
            {saving ? "Guardando…" : isShiftFull() ? "Turno completo" : "+ Asignar"}
          </button>
        </div>

        {/* ── Dirección ── */}
        <p className="sec-lbl" style={{ marginTop: 32 }}>Información de la unidad</p>
        <div className="info-card">
          <div className="info-row">
            <span className="info-icon">📍</span>
            <div>
              <div className="info-lbl">Dirección</div>
              <div className="info-val">{unit.address || <span style={{ color: "var(--dim)" }}>Sin dirección registrada</span>}</div>
            </div>
          </div>
        </div>

        {/* ── Observaciones por día ── */}
        <p className="sec-lbl" style={{ marginTop: 32 }}>Observaciones semanales</p>
        <div className="obs-grid">
          {weekDays.map((day, i) => {
            const key = dateKey(day);
            const isToday = dateKey(new Date()) === key;
            return (
              <div key={key} className={"obs-card" + (isToday ? " obs-today" : "")}>
                <div className="obs-head">
                  <span className="obs-day">{DAY_SHORT[i]}</span>
                  <span className="obs-date">{day.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</span>
                  {isToday && <span className="obs-now">Hoy</span>}
                </div>
                <textarea
                  className="obs-textarea"
                  placeholder="Escribir observación…"
                  value={observations[key] ?? ""}
                  onChange={e => setObservations(p => ({ ...p, [key]: e.target.value }))}
                  rows={3}
                />
                <button
                  className={"obs-save" + (savedObs[key] ? " obs-saved" : "")}
                  onClick={() => saveObservation(key)}
                  disabled={savingObs[key]}
                >
                  {savingObs[key] ? "Guardando…" : savedObs[key] ? "✓ Guardado" : "Guardar"}
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Modal confirmar finalizar ── */}
        {confirm && (
          <div className="modal-overlay" onClick={() => setConfirm(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-icon">🛑</div>
              <h3 className="modal-title">¿Finalizar asignación?</h3>
              <p className="modal-desc">
                El agente <strong>{assignments.find(a => a.id === confirm)?.personnelName}</strong> será
                removido de este turno. Esta acción no se puede deshacer.
              </p>
              <div className="modal-actions">
                <button className="btn-danger" onClick={() => handleFinish(confirm)}>Sí, finalizar</button>
                <button className="btn-cancel" onClick={() => setConfirm(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── CSS ──────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Montserrat:wght@300;400;500;600&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --gold: #C9A84C; --gold-light: #E8C97A;
  --black: #0A0A0A; --card: #141414; --card2: #1c1c1c;
  --white: #F5F0E8; --dim: rgba(245,240,232,.5);
  --border: rgba(201,168,76,.18);
  --danger: #E57373; --success: #81C784;
}
.udp { background: var(--black); min-height: 100vh; font-family: 'Montserrat', sans-serif; color: var(--white); padding: 28px 20px 60px; }
.udp::before { content:''; position:fixed; inset:0; background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px); background-size:48px 48px; pointer-events:none; z-index:0; }
.udp > * { position:relative; z-index:1; }
.udp-eye   { font-size:9px; font-weight:600; letter-spacing:4px; text-transform:uppercase; color:var(--gold); margin-bottom:4px; }
.udp-title { font-family:'Cormorant Garamond',serif; font-size:clamp(22px,5vw,36px); font-weight:300; line-height:1.1; margin-bottom:6px; }
.udp-addr  { font-size:11px; color:var(--dim); }
.udp-header { display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:28px; }
.udp-header-right { display:flex; align-items:center; gap:16px; flex-shrink:0; }
.status-badge { font-size:9px; font-weight:600; padding:4px 10px; letter-spacing:1px; border:1px solid; }
.status-active   { background:rgba(129,199,132,.1); color:var(--success); border-color:rgba(129,199,132,.3); }
.status-inactive { background:rgba(229,115,115,.1); color:var(--danger);  border-color:rgba(229,115,115,.3); }
.pct-ring { position:relative; width:52px; height:52px; flex-shrink:0; }
.pct-svg  { width:100%; height:100%; }
.pct-val  { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600; color:var(--white); }
.cov-row  { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin-bottom:32px; }
.cov-card { background:var(--card); border:1px solid var(--border); padding:14px 14px 10px; display:flex; flex-direction:column; gap:6px; }
.cov-card.cov-ok   { border-color:rgba(129,199,132,.3); }
.cov-card.cov-miss { border-color:rgba(229,115,115,.3); }
.cov-shift { font-size:9px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--dim); }
.cov-nums  { font-family:'Cormorant Garamond',serif; font-size:28px; font-weight:300; color:var(--white); line-height:1; }
.cov-nums span { font-size:16px; color:var(--dim); }
.cov-bar   { height:3px; background:rgba(255,255,255,.06); border-radius:2px; overflow:hidden; }
.cov-fill  { height:100%; background:var(--gold); border-radius:2px; transition:width .4s; }
.cov-card.cov-ok   .cov-fill { background:var(--success); }
.cov-card.cov-miss .cov-fill { background:var(--danger); }
.cov-miss-lbl { font-size:9px; color:var(--danger); }
.sec-lbl { font-size:9px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:var(--gold); margin-bottom:12px; }
.shifts-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:8px; }
.shift-col { background:var(--card); border:1px solid var(--border); display:flex; flex-direction:column; min-height:120px; transition:border-color .2s; }
.shift-col.over { border-color:var(--gold); background:rgba(201,168,76,.06); }
.shift-col-head { display:flex; align-items:center; gap:6px; padding:10px 12px 8px; border-bottom:1px solid var(--border); }
.shift-icon  { font-size:14px; }
.shift-label { font-size:9px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--gold); flex:1; }
.shift-count { font-size:10px; color:var(--dim); background:rgba(255,255,255,.05); padding:1px 6px; border-radius:10px; }
.shift-col-body { padding:8px; display:flex; flex-direction:column; gap:5px; flex:1; }
.shift-empty { font-size:10px; color:rgba(245,240,232,.2); font-style:italic; padding:8px 0; text-align:center; }
.drop-placeholder { border:1px dashed var(--gold); color:var(--gold); font-size:10px; padding:8px; text-align:center; animation:pulse .8s ease infinite alternate; }
@keyframes pulse { from{opacity:.5} to{opacity:1} }
.asgn-card { background:var(--card2); border:1px solid rgba(201,168,76,.12); padding:7px 10px; cursor:grab; display:flex; align-items:center; justify-content:space-between; gap:6px; transition:border-color .2s,background .2s; user-select:none; }
.asgn-card:hover { border-color:var(--gold); background:rgba(201,168,76,.06); }
.asgn-card.dragging { opacity:.5; cursor:grabbing; }
.asgn-name   { font-size:11px; color:var(--white); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
.asgn-finish { background:none; border:none; color:rgba(229,115,115,.5); font-size:11px; cursor:pointer; padding:0 2px; transition:color .15s; flex-shrink:0; }
.asgn-finish:hover { color:var(--danger); }
.assign-box { display:flex; gap:8px; flex-wrap:wrap; }
.udp-select { flex:1; min-width:160px; background:var(--card); border:1px solid var(--border); color:var(--white); padding:11px 12px; font-family:'Montserrat',sans-serif; font-size:12px; outline:none; cursor:pointer; transition:border-color .2s; }
.udp-select:focus { border-color:var(--gold); }
.udp-select-sm { flex:0 0 140px; }
.btn-assign { padding:11px 20px; background:var(--gold); color:var(--black); border:none; font-family:'Montserrat',sans-serif; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; cursor:pointer; white-space:nowrap; transition:opacity .2s; }
.btn-assign:disabled { opacity:.35; cursor:not-allowed; }
.btn-assign:not(:disabled):hover { opacity:.85; }
.info-card { background:var(--card); border:1px solid var(--border); padding:16px 18px; }
.info-row  { display:flex; align-items:flex-start; gap:12px; }
.info-icon { font-size:18px; flex-shrink:0; margin-top:2px; }
.info-lbl  { font-size:9px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:var(--gold); margin-bottom:4px; }
.info-val  { font-size:13px; color:var(--white); line-height:1.4; }
.obs-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
.obs-card { background:var(--card); border:1px solid var(--border); padding:10px 10px 8px; display:flex; flex-direction:column; gap:6px; transition:border-color .2s; }
.obs-card:hover { border-color:rgba(201,168,76,.35); }
.obs-today { border-color:var(--gold); background:rgba(201,168,76,.04); }
.obs-head  { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
.obs-day   { font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--gold); }
.obs-date  { font-size:9px; color:var(--dim); flex:1; }
.obs-now   { font-size:8px; font-weight:600; padding:1px 5px; background:rgba(201,168,76,.15); color:var(--gold); border:1px solid rgba(201,168,76,.3); }
.obs-textarea { width:100%; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); color:var(--white); font-family:'Montserrat',sans-serif; font-size:11px; padding:7px 8px; resize:vertical; outline:none; line-height:1.5; transition:border-color .2s; min-height:60px; }
.obs-textarea:focus { border-color:var(--gold); background:rgba(201,168,76,.03); }
.obs-textarea::placeholder { color:rgba(245,240,232,.2); }
.obs-save { width:100%; padding:6px; background:none; border:1px solid var(--border); color:var(--dim); font-family:'Montserrat',sans-serif; font-size:9px; font-weight:600; letter-spacing:1px; text-transform:uppercase; cursor:pointer; transition:all .2s; }
.obs-save:hover:not(:disabled) { border-color:var(--gold); color:var(--gold); background:rgba(201,168,76,.06); }
.obs-save:disabled { opacity:.4; cursor:not-allowed; }
.obs-saved { border-color:var(--success) !important; color:var(--success) !important; background:rgba(129,199,132,.06) !important; }
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.75); backdrop-filter:blur(8px); display:flex; justify-content:center; align-items:center; z-index:10000; padding:16px; }
.modal { background:#161625; border:1px solid rgba(229,115,115,.2); padding:32px 28px; width:100%; max-width:360px; display:flex; flex-direction:column; align-items:center; gap:14px; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,.8); }
.modal-icon  { font-size:36px; }
.modal-title { font-family:'Cormorant Garamond',serif; font-size:24px; font-weight:300; color:var(--white); }
.modal-desc  { font-size:12px; color:var(--dim); line-height:1.6; }
.modal-desc strong { color:var(--white); }
.modal-actions { display:flex; gap:8px; width:100%; }
.btn-danger { flex:1; padding:12px; background:var(--danger); color:#fff; border:none; font-family:'Montserrat',sans-serif; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; cursor:pointer; transition:opacity .2s; }
.btn-danger:hover { opacity:.85; }
.btn-cancel { flex:1; padding:12px; background:transparent; color:var(--dim); border:1px solid var(--border); font-family:'Montserrat',sans-serif; font-size:11px; cursor:pointer; transition:border-color .2s; }
.btn-cancel:hover { border-color:var(--gold); color:var(--white); }
.udp-loading { display:flex; align-items:center; gap:12px; padding:60px 20px; color:var(--dim); font-size:13px; }
.udp-spinner { width:18px; height:18px; border:2px solid var(--border); border-top-color:var(--gold); border-radius:50%; animation:spin .7s linear infinite; flex-shrink:0; }
@keyframes spin { to{transform:rotate(360deg)} }
@media (max-width:900px) { .obs-grid { grid-template-columns:repeat(4,1fr); } }
@media (max-width:600px) {
  .udp { padding:16px 12px 48px; }
  .shifts-grid { grid-template-columns:1fr; }
  .assign-box { flex-direction:column; }
  .udp-select-sm { flex:1; }
  .udp-header { flex-direction:column; }
  .obs-grid { grid-template-columns:repeat(2,1fr); }
}
`;