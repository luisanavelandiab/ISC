/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  collection, onSnapshot, query, where,
  doc, setDoc, updateDoc, addDoc, Timestamp, orderBy, writeBatch,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import Link from "next/link";

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type ShiftType = "A" | "B" | "C" | "D" | "E";
type AlertSeverity = "critica" | "advertencia" | "info";
type AlertType =
  | "sin_cobertura"
  | "perfil_incorrecto"
  | "sin_descanso"
  | "cobertura_baja"
  | "cambios_sin_publicar"
  | "turno_duplicado";

interface RequiredPosition {
  shiftType: string;
  quantity: number;
  preferredShift?: "dia" | "noche";
  requiredCategory?: string;
}
interface Unit {
  id: string;
  name: string;
  shiftType: ShiftType;
  requiredPositions: RequiredPosition[];
  restDay?: number;
  minCoverage?: number;
}
interface Guard {
  id: string;
  name: string;
  available: boolean;
  preferredShift?: "dia" | "noche" | "ambos" | string;
  assignedUnit?: string;
  canRotate?: boolean;
  category?: string;
  certifications?: string[];
  state?: string;
  authRole?: string;
}
interface Assignment {
  id: string;
  unitId: string;
  unitName: string;
  guardId: string;
  guardName: string;
  date: Date;
  shift: "dia" | "noche" | "descanso";
  status: "borrador" | "publicado";
  createdBy?: string;
  publishedAt?: Date | null;
}
interface AlertDoc {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  unitId?: string;
  unitName?: string;
  guardId?: string;
  guardName?: string;
  date?: Date;
  message: string;
  resolved: boolean;
  createdAt: Date;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function getMonday(d: Date) {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - day + (day === 0 ? -6 : 1));
  r.setHours(0, 0, 0, 0);
  return r;
}
function getWeekDays(offset: number): Date[] {
  const base = getMonday(new Date());
  base.setDate(base.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });
}
function fmtRange(days: Date[]) {
  return (
    days[0].toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) +
    " — " +
    days[6].toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
  );
}
function dateKey(d: Date) { return d.toISOString().slice(0, 10); }

function isGuardAvailable(g: Guard) {
  return (
    g.available === true ||
    (g.available as any) === "true" ||
    g.state === "Activo" ||
    g.state === "activo" ||
    g.available === undefined
  );
}

// ── FIX 3: excluir supervisores y roles admin/coordinador del selector ──
function isAssignableGuard(g: Guard) {
  if (!isGuardAvailable(g)) return false;
  const cat = (g.category || "").toLowerCase();
  const role = (g.authRole || "").toLowerCase();
  if (cat === "supervisor") return false;
  if (role === "admin" || role === "coordinador" || role === "supervisor") return false;
  return true;
}

// ─────────────────────────────────────────────
// VALIDACIÓN
// ─────────────────────────────────────────────
interface ValidationResult {
  valid: boolean;
  warnings: { type: AlertType; severity: AlertSeverity; message: string }[];
}

function validateAssignment(
  guard: Guard,
  unit: Unit,
  shift: "dia" | "noche",
  date: Date,
  existingAssignments: Assignment[]
): ValidationResult {
  const warnings: ValidationResult["warnings"] = [];

  // 1. Turno duplicado ese día
  const alreadyToday = existingAssignments.filter(
    (a) =>
      a.guardId === guard.id &&
      dateKey(a.date) === dateKey(date) &&
      a.shift !== "descanso"
  );
  if (alreadyToday.length > 0) {
    warnings.push({
      type: "turno_duplicado",
      severity: "critica",
      message: `${guard.name} ya tiene turno el ${date.toLocaleDateString("es-ES")} en ${alreadyToday[0].unitName}.`,
    });
  }

  // 2. Preferencia de turno — solo alerta si tiene preferencia específica (no "ambos")
  const pref = (guard.preferredShift || "").toLowerCase();
  if (pref && pref !== "ambos" && pref !== shift) {
    warnings.push({
      type: "perfil_incorrecto",
      severity: "advertencia",
      message: `${guard.name} prefiere turno de ${guard.preferredShift}, se le asigna turno de ${shift}.`,
    });
  }

  // 3. FIX: Categoría requerida — "ambos" nunca genera alerta
  const req = unit.requiredPositions?.find((p) => p.preferredShift === shift);
  const guardCat = (guard.category || "").toLowerCase();
  const reqCat   = (req?.requiredCategory || "").toLowerCase();

  if (
    req?.requiredCategory &&
    reqCat &&
    guardCat !== reqCat &&
    guardCat !== "ambos" // ← FIX: si es "ambos" puede ir a cualquier turno
  ) {
    warnings.push({
      type: "perfil_incorrecto",
      severity: "advertencia",
      message: `La unidad ${unit.name} requiere categoría "${req.requiredCategory}" para turno ${shift}. ${guard.name} tiene categoría "${guard.category || "sin definir"}".`,
    });
  }

  // 4. Días consecutivos sin descanso
  const sortedPrev = existingAssignments
    .filter((a) => a.guardId === guard.id && a.shift !== "descanso" && a.date < date)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  let consecutivos = 0;
  for (let i = 1; i <= 7; i++) {
    const check = new Date(date);
    check.setDate(date.getDate() - i);
    if (sortedPrev.some((a) => dateKey(a.date) === dateKey(check))) consecutivos++;
    else break;
  }
  if (consecutivos >= 6) {
    warnings.push({
      type: "sin_descanso",
      severity: "critica",
      message: `${guard.name} llevaría ${consecutivos + 1} días consecutivos sin descanso.`,
    });
  }

  return { valid: !warnings.some((w) => w.severity === "critica"), warnings };
}

function coverageStatus(required: number, assigned: number): { label: string; cls: string } {
  if (assigned >= required) return { label: "Completo", cls: "cov-ok" };
  if (assigned >= required * 0.5) return { label: "Incompleto", cls: "cov-partial" };
  return { label: "Crítico", cls: "cov-critical" };
}

// ─────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────
export default function DashboardPage() {
  const [units,        setUnits]        = useState<Unit[]>([]);
  const [guards,       setGuards]       = useState<Guard[]>([]);
  const [assignments,  setAssignments]  = useState<Assignment[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertDoc[]>([]);
  const [weekOffset,   setWeekOffset]   = useState(0);
  const [filterUnit,   setFilterUnit]   = useState("all");
  const [ddOpen,       setDdOpen]       = useState(false);
  const [view,         setView]         = useState<"calendar"|"chart">("calendar");
  const [modal,        setModal]        = useState<{
    unitId: string; unitName: string; date: Date; prefShift?: "dia"|"noche";
  } | null>(null);
  const [selGuard,          setSelGuard]          = useState("");
  const [selShift,          setSelShift]          = useState<"dia"|"noche">("dia");
  const [saving,            setSaving]            = useState(false);
  const [publishing,        setPublishing]        = useState(false);
  const [publishSuccess,    setPublishSuccess]    = useState(false);
  const [validationResult,  setValidationResult]  = useState<ValidationResult|null>(null);

  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Firestore ──
  useEffect(() => {
    const u1 = onSnapshot(collection(db,"units"), snap =>
      setUnits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Unit)))
    );

    // FIX 1: normalizar nombre → tomar fullName si name no existe
    const u2 = onSnapshot(collection(db,"personnel"), snap =>
      setGuards(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          name: data.fullName || data.name || "Sin nombre",
        } as Guard;
      }))
    );

    const u3 = onSnapshot(
      query(collection(db,"assignments"), where("status","in",["borrador","publicado"])),
      snap => {
        const data: Assignment[] = [];
        snap.docs.forEach(docu => {
          const d = docu.data();
          const date = d.date?.toDate?.();
          if (date) data.push({ id: docu.id, ...d, date, status: d.status||"borrador" } as Assignment);
        });
        setAssignments(data);
      }
    );

    const u4 = onSnapshot(
      query(collection(db,"alerts"), where("resolved","==",false), orderBy("createdAt","desc")),
      snap => setActiveAlerts(snap.docs.map(d => {
        const raw = d.data();
        return { id: d.id, ...raw, createdAt: raw.createdAt?.toDate?.() || new Date(), date: raw.date?.toDate?.() } as AlertDoc;
      }))
    );

    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  // Cerrar dropdown al click fuera
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node))
        setDdOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  const weekAssignments = useMemo(
    () => assignments.filter(a => weekDays.some(d => dateKey(d) === dateKey(a.date))),
    [assignments, weekDays]
  );

  const draftCount = weekAssignments.filter(a => a.status === "borrador").length;

  // Validación en tiempo real
  useEffect(() => {
    if (!modal || !selGuard) { setValidationResult(null); return; }
    const guard = guards.find(g => g.id === selGuard);
    const unit  = units.find(u => u.id === modal.unitId);
    if (!guard || !unit) return;
    setValidationResult(validateAssignment(guard, unit, selShift, modal.date, assignments));
  }, [selGuard, selShift, modal, guards, units, assignments]);

  // Cobertura
  const coverageMap = useMemo(() => {
    const map: Record<string,{required:number;assigned:number}> = {};
    units.forEach(u => {
      const req  = u.requiredPositions?.reduce((s,p) => s+p.quantity, 0) || 0;
      const asgn = weekAssignments.filter(a => a.unitId===u.id && a.shift!=="descanso").length;
      map[u.id] = { required: req*7, assigned: asgn };
    });
    return map;
  }, [units, weekAssignments]);

  const chartData = units.map(u => ({
    name:       u.name.length > 9 ? u.name.slice(0,9)+"…" : u.name,
    Requerido:  coverageMap[u.id]?.required || 0,
    Asignado:   coverageMap[u.id]?.assigned  || 0,
  }));

  const visibleUnits = filterUnit==="all" ? units : units.filter(u => u.id===filterUnit);
  const selLabel = filterUnit==="all" ? "Todas" : (units.find(u => u.id===filterUnit)?.name ?? "Todas");

  const totalRequired = Object.values(coverageMap).reduce((s,v) => s+v.required, 0);
  const totalAssigned = Object.values(coverageMap).reduce((s,v) => s+v.assigned, 0);
  const coveragePct   = totalRequired > 0 ? Math.round(totalAssigned/totalRequired*100) : 0;

  // ── Guardar asignación ──
  async function handleAssign() {
    if (!modal || !selGuard) return;
    setSaving(true);
    try {
      const guard = guards.find(g => g.id === selGuard);
      const unit  = units.find(u => u.id === modal.unitId);
      if (!guard || !unit) {
        console.error("Guard o unit no encontrado:", { selGuard, unitId: modal.unitId });
        return;
      }

      // ID seguro: usar solo addDoc para evitar problemas con IDs manuales
      console.log("Guardando asignación...", { guardId: selGuard, unitId: modal.unitId, shift: selShift });

      const assignmentRef = await addDoc(collection(db, "assignments"), {
        unitId:     modal.unitId,
        unitName:   modal.unitName,
        guardId:    selGuard,
        guardName:  guard.name,
        date:       Timestamp.fromDate(modal.date),
        shift:      selShift,
        status:     "borrador",
        createdBy:  "admin",
        createdAt:  Timestamp.now(),
        publishedAt: null,
      });
      console.log("✓ Assignment guardado:", assignmentRef.id);

      // changeLog — no es crítico, no bloquea si falla
      try {
        await addDoc(collection(db, "changeLog"), {
          action:       "assign",
          adminId:      "admin",
          timestamp:    Timestamp.now(),
          assignmentId: assignmentRef.id,
          unitId:       modal.unitId,
          unitName:     modal.unitName,
          guardId:      selGuard,
          guardName:    guard.name,
          date:         Timestamp.fromDate(modal.date),
          shift:        selShift,
          weekStart:    Timestamp.fromDate(weekDays[0]),
        });
        console.log("✓ ChangeLog guardado");
      } catch (logErr) {
        console.warn("changeLog no se pudo guardar (no crítico):", logErr);
      }

      // alerts — no es crítico, no bloquea si falla
      if (validationResult?.warnings?.length) {
        try {
          for (const w of validationResult.warnings) {
            await addDoc(collection(db, "alerts"), {
              type:         w.type,
              severity:     w.severity,
              message:      w.message,
              unitId:       modal.unitId,
              unitName:     modal.unitName,
              guardId:      selGuard,
              guardName:    guard.name,
              date:         Timestamp.fromDate(modal.date),
              assignmentId: assignmentRef.id,
              resolved:     false,
              createdAt:    Timestamp.now(),
            });
          }
          console.log("✓ Alerts guardadas");
        } catch (alertErr) {
          console.warn("Alerts no se pudieron guardar (no crítico):", alertErr);
        }
      }

      setModal(null);
      setSelGuard("");
      setSelShift("dia");
      setValidationResult(null);

    } catch (e) {
      console.error("ERROR al guardar asignación:", e);
      alert(`Error al guardar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Eliminar asignación ──
  async function handleDelete(id: string) {
    try {
      await updateDoc(doc(db, "assignments", id), { status: "inactivo" });
      try {
        await addDoc(collection(db, "changeLog"), {
          action: "delete", adminId: "admin", timestamp: Timestamp.now(),
          assignmentId: id, weekStart: Timestamp.fromDate(weekDays[0]),
        });
      } catch (logErr) {
        console.warn("changeLog delete no guardado:", logErr);
      }
    } catch (e) {
      console.error("Error eliminando asignación:", e);
      alert("Error al eliminar: " + (e as Error).message);
    }
  }

  // ── Publicar ──
  async function handlePublish() {
    if (draftCount===0) return;
    setPublishing(true);
    try {
      const batch  = writeBatch(db);
      const drafts = weekAssignments.filter(a => a.status==="borrador");
      const now    = Timestamp.now();
      drafts.forEach(a => batch.update(doc(db,"assignments",a.id), { status:"publicado", publishedAt:now }));
      await batch.commit();
      await addDoc(collection(db,"changeLog"), {
        action:"publish", adminId:"admin", timestamp:now,
        weekStart: Timestamp.fromDate(weekDays[0]),
        weekEnd:   Timestamp.fromDate(weekDays[6]),
        affectedCount: drafts.length,
        affectedAssignments: drafts.map(a => a.id),
      });
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 3000);
    } finally { setPublishing(false); }
  }

  // ── Vigilantes asignables (sin supervisores/admins/coordinadores) ──
  const assignableGuards = useMemo(() => guards.filter(isAssignableGuard), [guards]);

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="dp">

        {/* Header */}
        <div className="dp-header-row">
          <div>
            <p className="dp-eye">Panel de administración</p>
            <h1 className="dp-title">Centro de Control <span>Operativo</span></h1>
          </div>
          <nav className="dp-nav">
            <Link href="/admin/alertas" className="dp-nav-btn">
              <span className="dp-nav-icon">🔔</span>
              <span className="dp-nav-label">Alertas</span>
              {activeAlerts.length>0 && <span className="dp-nav-badge">{activeAlerts.length}</span>}
            </Link>
            <Link href="/admin/historial" className="dp-nav-btn">
              <span className="dp-nav-icon">📋</span>
              <span className="dp-nav-label">Historial</span>
            </Link>
          </nav>
        </div>

        {/* KPIs */}
        <div className="kpi-row">
          <div className="kpi"><div className="kpi-lbl">Unidades</div><div className="kpi-val">{units.length}</div></div>
          <div className="kpi"><div className="kpi-lbl">Agentes</div><div className="kpi-val">{assignableGuards.length}</div></div>
          <div className="kpi">
            <div className="kpi-lbl">Cobertura</div>
            <div className="kpi-val" style={{ color: coveragePct>=90?"#81C784":coveragePct>=60?"var(--gold)":"#E57373" }}>{coveragePct}%</div>
          </div>
          <div className="kpi">
            <div className="kpi-lbl">Alertas</div>
            <div className="kpi-val" style={{ color: activeAlerts.length>0?"#E57373":"#81C784" }}>{activeAlerts.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tab-row">
          <button className={"tab-btn"+(view==="calendar"?" active":"")} onClick={()=>setView("calendar")}>📅 Calendario</button>
          <button className={"tab-btn"+(view==="chart"?" active":"")} onClick={()=>setView("chart")}>📊 Cobertura</button>
        </div>

        {/* Panel Cobertura */}
        <div style={{ display: view==="chart"?"block":"none" }} className="chart-panel">
          <p className="sec-lbl">Cobertura semanal por unidad</p>
          <div className="chart-card">
            <div style={{ width:"100%", height:220, minWidth:0 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} barCategoryGap="35%">
                  <XAxis dataKey="name" tick={{ fill:"rgba(245,240,232,.45)", fontSize:9, fontFamily:"Montserrat" }} axisLine={{ stroke:"rgba(201,168,76,.15)" }} tickLine={false}/>
                  <YAxis tick={{ fill:"rgba(245,240,232,.45)", fontSize:9, fontFamily:"Montserrat" }} axisLine={false} tickLine={false} width={22}/>
                  <Tooltip contentStyle={{ background:"#141414", border:"1px solid rgba(201,168,76,.25)", fontFamily:"Montserrat", fontSize:11, color:"#F5F0E8" }} cursor={{ fill:"rgba(201,168,76,.04)" }}/>
                  <Bar dataKey="Requerido" fill="#E57373" radius={0}/>
                  <Bar dataKey="Asignado"  fill="#C9A84C" radius={0}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Panel Calendario */}
        <div style={{ display: view==="calendar"?"block":"none" }} className="calendar-panel">
          {/* Controles semana */}
          <div className="week-bar">
            <button className="nav-btn" onClick={()=>setWeekOffset(w=>w-1)}>◀</button>
            <span className="week-range">📅 {fmtRange(weekDays)}</span>
            <button className="nav-btn" onClick={()=>setWeekOffset(w=>w+1)}>▶</button>

            <div className="week-status">
              {draftCount>0
                ? <span className="status-draft">✎ {draftCount} borrador{draftCount!==1?"es":""}</span>
                : <span className="status-published">✓ Publicado</span>
              }
            </div>

            <div className="dd-wrap">
              <button ref={btnRef} className="dd-btn" onClick={()=>setDdOpen(o=>!o)}>
                <span className="dd-txt">{selLabel}</span>
                <span className={"dd-arrow"+(ddOpen?" open":"")}>▼</span>
              </button>
              {ddOpen && (
                <div ref={menuRef} className="dd-menu">
                  <div className={"dd-item"+(filterUnit==="all"?" sel":"")} onClick={()=>{setFilterUnit("all");setDdOpen(false);}}>
                    <span>Todas</span>
                    <span className="cov-badge cov-partial">{units.length}</span>
                  </div>
                  {units.map(u => {
                    const {required,assigned} = coverageMap[u.id]||{required:0,assigned:0};
                    const {label,cls} = coverageStatus(required,assigned);
                    return (
                      <div key={u.id} className={"dd-item"+(filterUnit===u.id?" sel":"")} onClick={()=>{setFilterUnit(u.id);setDdOpen(false);}}>
                        <span className="dd-item-name">{u.name}</span>
                        <span className={"cov-badge "+cls}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              className={"publish-btn"+(publishSuccess?" publish-success":"")}
              onClick={handlePublish}
              disabled={publishing||draftCount===0}
              title={draftCount===0?"No hay borradores pendientes":`Publicar ${draftCount} cambios`}
            >
              {publishing ? <span className="publish-spinner"/>
                : publishSuccess ? "✓ Publicado"
                : <><span>↑</span> Publicar{draftCount>0&&<span className="publish-count">{draftCount}</span>}</>
              }
            </button>
          </div>

          <p className="tbl-hint">← desliza para ver la semana →</p>

          {/* Tabla */}
          <div className="tbl-scroll">
            <div className="mgrid" style={{ gridTemplateColumns:`150px repeat(7, minmax(100px,1fr))` }}>
              <div className="mhdr">Unidad</div>
              {weekDays.map(d => (
                <div key={d.toISOString()} className="mhdr">
                  {d.toLocaleDateString("es-ES",{weekday:"short",day:"2-digit"})}
                </div>
              ))}

              {visibleUnits.map(unit => (
                <React.Fragment key={unit.id}>
                  <div className="munit">
                    <strong>{unit.name}</strong>
                    <span className="munit-sub">Tipo {unit.shiftType}</span>
                  </div>
                  {weekDays.map(day => {
                    const cellAsgs  = weekAssignments.filter(a => a.unitId===unit.id && dateKey(a.date)===dateKey(day));
                    const dayAsgs   = cellAsgs.filter(a => a.shift==="dia");
                    const nightAsgs = cellAsgs.filter(a => a.shift==="noche");
                    const restAsgs  = cellAsgs.filter(a => a.shift==="descanso");
                    const cellAlerts= activeAlerts.filter(al => al.unitId===unit.id && al.date && dateKey(al.date)===dateKey(day));
                    return (
                      <div key={dateKey(day)} className={"mcell"+(cellAlerts.length>0?" mcell-alert":"")}>
                        {cellAlerts.length>0 && <div className="cell-alert-dot" title={cellAlerts[0].message}>⚠</div>}

                        {/* Día */}
                        <div className="shift-row">
                          <span className="shift-label shift-label-day">☀️ Día</span>
                          {dayAsgs.map(a => (
                            <div key={a.id} className="pill pill-day pill-inline">
                              <span>{a.guardName}</span>
                              {a.status==="borrador"&&<span className="pill-draft" title="Borrador">●</span>}
                              <button className="pill-del" title="Eliminar" onClick={e=>{e.stopPropagation();handleDelete(a.id);}}>✕</button>
                            </div>
                          ))}
                          {dayAsgs.length===0&&<span className="shift-empty">Sin cubrir</span>}
                          <button className="shift-add" title="Agregar turno día" onClick={e=>{e.stopPropagation();setSelShift("dia");setModal({unitId:unit.id,unitName:unit.name,date:day,prefShift:"dia"});}}>+</button>
                        </div>

                        {/* Noche */}
                        <div className="shift-row shift-row-night">
                          <span className="shift-label shift-label-night">🌙 Noche</span>
                          {nightAsgs.map(a => (
                            <div key={a.id} className="pill pill-night pill-inline">
                              <span>{a.guardName}</span>
                              {a.status==="borrador"&&<span className="pill-draft" title="Borrador">●</span>}
                              <button className="pill-del" title="Eliminar" onClick={e=>{e.stopPropagation();handleDelete(a.id);}}>✕</button>
                            </div>
                          ))}
                          {nightAsgs.length===0&&<span className="shift-empty">Sin cubrir</span>}
                          <button className="shift-add" title="Agregar turno noche" onClick={e=>{e.stopPropagation();setSelShift("noche");setModal({unitId:unit.id,unitName:unit.name,date:day,prefShift:"noche"});}}>+</button>
                        </div>

                        {/* Descanso */}
                        {restAsgs.length>0&&(
                          <div className="shift-row shift-row-rest">
                            <span className="shift-label" style={{color:"#888"}}>💤 Descanso</span>
                            {restAsgs.map(a => (
                              <div key={a.id} className="pill pill-rest pill-inline">
                                <span>{a.guardName}</span>
                                <button className="pill-del" onClick={e=>{e.stopPropagation();handleDelete(a.id);}}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Tarjetas móvil */}
          <div className="unit-cards">
            {visibleUnits.map(unit => (
              <div key={unit.id} className="unit-card">
                <div className="uc-head">
                  <span className="uc-name">{unit.name}</span>
                  <span className="cov-type">Tipo {unit.shiftType}</span>
                </div>
                <div className="uc-days">
                  {weekDays.map(day => {
                    const cellAsgs = weekAssignments.filter(a => a.unitId===unit.id && dateKey(a.date)===dateKey(day) && a.shift!=="descanso");
                    const hasRest  = weekAssignments.some(a => a.unitId===unit.id && dateKey(a.date)===dateKey(day) && a.shift==="descanso");
                    const hasDraft = weekAssignments.some(a => a.unitId===unit.id && dateKey(a.date)===dateKey(day) && a.status==="borrador");
                    return (
                      <div key={dateKey(day)} className="uc-day" onClick={()=>setModal({unitId:unit.id,unitName:unit.name,date:day})}>
                        <span className="uc-dname">{day.toLocaleDateString("es-ES",{weekday:"short"})}</span>
                        <span className="uc-dnum">{day.getDate()}</span>
                        <div className={"uc-dot "+(hasRest?"dot-rest":cellAsgs.length>0?"dot-ok":"dot-miss")}/>
                        {hasDraft&&<span className="uc-draft-dot" title="Borrador">●</span>}
                        {cellAsgs.length>0&&<span className="uc-guard-count">{cellAsgs.length}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Leyenda */}
          <div className="legend">
            <span className="legend-item"><span className="legend-dot" style={{background:"var(--gold)"}}/> Publicado</span>
            <span className="legend-item"><span className="legend-dot draft-dot"/> Borrador</span>
            <span className="legend-item"><span className="legend-dot" style={{background:"#E57373"}}/> Sin cubrir</span>
          </div>
        </div>

        {/* ── Modal asignación ── */}
        {modal && (
          <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setModal(null);setValidationResult(null);}}}>
            <div className="modal">
              <div className="modal-handle"/>
              <h3 className="modal-title">Asignar Agente</h3>

              <div className="modal-info">
                <span><strong>Unidad:</strong> {modal.unitName}</span>
                <span><strong>Fecha:</strong> {modal.date.toLocaleDateString("es-ES",{weekday:"long",day:"2-digit",month:"long"})}</span>
              </div>

              {/* Asignaciones actuales */}
              {(()=>{
                const existing = weekAssignments.filter(a => a.unitId===modal.unitId && dateKey(a.date)===dateKey(modal.date));
                return existing.length>0 ? (
                  <div className="modal-existing">
                    <p className="modal-existing-lbl">Asignaciones actuales:</p>
                    <div className="modal-existing-list">
                      {existing.map(a => (
                        <div key={a.id} className={"pill "+(a.shift==="dia"?"pill-day":a.shift==="noche"?"pill-night":"pill-rest")}>
                          {a.guardName} <em style={{opacity:.6}}>({a.shift}{a.status==="borrador"?" · borrador":""})</em>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Selector turno */}
              <select value={selShift} onChange={e=>setSelShift(e.target.value as "dia"|"noche")}>
                <option value="dia">☀️ Turno Día</option>
                <option value="noche">🌙 Turno Noche</option>
              </select>

              {/* FIX: selector solo muestra vigilantes asignables */}
              <select value={selGuard} onChange={e=>setSelGuard(e.target.value)}>
                <option value="">— Seleccionar agente —</option>
                {assignableGuards.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.preferredShift && g.preferredShift.toLowerCase()!=="ambos"
                      ? ` · pref. ${g.preferredShift}`
                      : g.preferredShift?.toLowerCase()==="ambos"
                      ? " · cualquier turno"
                      : ""}
                    {g.category && g.category.toLowerCase()!=="ambos"
                      ? ` · cat. ${g.category}`
                      : ""}
                  </option>
                ))}
              </select>

              {/* Validación */}
              {validationResult && validationResult.warnings.length>0 && (
                <div className="validation-panel">
                  <p className="validation-title">
                    {validationResult.valid ? "⚠ Advertencias" : "🚫 Conflictos detectados"}
                  </p>
                  {validationResult.warnings.map((w,i) => (
                    <div key={i} className={"validation-item "+(w.severity==="critica"?"val-critical":"val-warning")}>
                      <span className="val-icon">{w.severity==="critica"?"✕":"⚠"}</span>
                      <span>{w.message}</span>
                    </div>
                  ))}
                  {!validationResult.valid && (
                    <p className="validation-note">Las alertas críticas se guardarán en el panel de alertas.</p>
                  )}
                </div>
              )}
              {validationResult && validationResult.warnings.length===0 && selGuard && (
                <div className="validation-ok">✓ Sin conflictos detectados</div>
              )}

              <div className="modal-actions">
                <button className="btn-p" onClick={handleAssign} disabled={saving||!selGuard}>
                  {saving?"Guardando…":"Guardar borrador"}
                </button>
                <button className="btn-s" onClick={()=>{setModal(null);setValidationResult(null);}}>Cancelar</button>
              </div>
              <p className="modal-note">💡 Se guarda como borrador. Usa Publicar para que los agentes lo vean.</p>
            </div>
          </div>
        )}

        {/* Toast */}
        {publishSuccess && (
          <div className="toast-success">✓ Cambios publicados — los agentes ya pueden verlos</div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Montserrat:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --gold:#C9A84C;--gold-light:#E8C97A;
  --black:#0A0A0A;--card:#141414;--card2:#1c1c1c;
  --white:#F5F0E8;--dim:rgba(245,240,232,.5);
  --border:rgba(201,168,76,.18);
  --red:#E57373;--blue:#4DA3FF;--green:#81C784;
}
.dp{background:var(--black);min-height:100vh;font-family:'Montserrat',sans-serif;color:var(--white);padding:20px 16px 60px}
.dp::before{content:'';position:fixed;inset:0;background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;z-index:0}
.dp>*{position:relative;z-index:1}
.dp-header-row{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap}
.dp-eye{font-size:9px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:4px}
.dp-title{font-family:'Cormorant Garamond',serif;font-size:clamp(22px,6vw,38px);font-weight:300;color:var(--white);line-height:1.1}
.dp-title span{color:var(--gold);font-style:italic;font-weight:600}
.dp-nav{display:flex;gap:6px;flex-shrink:0}
.dp-nav-btn{display:flex;align-items:center;gap:5px;padding:8px 12px;background:var(--card);border:1px solid var(--border);color:var(--dim);text-decoration:none;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;position:relative;transition:color .2s,border-color .2s;white-space:nowrap;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)}
.dp-nav-btn:hover{color:var(--gold);border-color:var(--gold)}
.dp-nav-icon{font-size:13px}
.dp-nav-label{display:none}
.dp-nav-badge{position:absolute;top:-5px;right:-5px;background:var(--red);color:#fff;font-size:8px;font-weight:700;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:24px}
.kpi{background:var(--card);border:1px solid var(--border);padding:clamp(8px,2vw,18px) clamp(6px,2vw,14px);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)}
.kpi-lbl{font-size:clamp(6px,1.8vw,9px);font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:4px}
.kpi-val{font-family:'Cormorant Garamond',serif;font-size:clamp(24px,6vw,42px);font-weight:300;line-height:1}
.tab-row{display:flex;gap:2px;margin-bottom:20px;border-bottom:1px solid var(--border)}
.tab-btn{flex:1;padding:10px 4px;background:none;border:none;color:var(--dim);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .2s}
.tab-btn.active{color:var(--gold);border-bottom-color:var(--gold)}
.sec-lbl{font-size:9px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
.chart-card{background:var(--card);border:1px solid var(--border);padding:16px 10px 8px;margin-bottom:24px}
.cov-badge{font-size:8px;font-weight:600;padding:2px 7px;border:1px solid;letter-spacing:.5px;white-space:nowrap;flex-shrink:0}
.cov-ok      {background:rgba(129,199,132,.1);border-color:rgba(129,199,132,.3);color:var(--green)}
.cov-partial {background:rgba(201,168,76,.12); border-color:rgba(201,168,76,.3); color:var(--gold)}
.cov-critical{background:rgba(229,115,115,.1); border-color:rgba(229,115,115,.3);color:var(--red)}
.week-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.week-range{font-size:10px;color:var(--dim);letter-spacing:.5px}
.nav-btn{width:32px;height:32px;flex-shrink:0;background:var(--card);border:1px solid var(--border);color:var(--gold);cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;transition:background .2s}
.nav-btn:hover{background:rgba(201,168,76,.1)}
.week-status{font-size:9px;font-weight:600;letter-spacing:1px;padding:4px 8px;border-radius:2px}
.status-draft    {color:var(--gold);background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.2)}
.status-published{color:var(--green);background:rgba(129,199,132,.1);border:1px solid rgba(129,199,132,.2)}
.publish-btn{display:flex;align-items:center;gap:6px;padding:9px 14px;background:var(--gold);border:none;color:var(--black);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);transition:opacity .2s,background .2s;flex-shrink:0;box-shadow:0 0 20px rgba(201,168,76,.25)}
.publish-btn:hover:not(:disabled){opacity:.9;box-shadow:0 0 30px rgba(201,168,76,.4)}
.publish-btn:disabled{opacity:.35;cursor:not-allowed;box-shadow:none}
.publish-btn.publish-success{background:var(--green);box-shadow:0 0 20px rgba(129,199,132,.3)}
.publish-count{background:rgba(0,0,0,.25);color:var(--black);font-size:9px;font-weight:800;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.publish-spinner{width:14px;height:14px;border:2px solid rgba(0,0,0,.3);border-top-color:var(--black);border-radius:50%;animation:spin .6s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
.dd-wrap{position:relative;min-width:110px;max-width:180px;flex:1}
.dd-btn{width:100%;background:var(--card);border:1px solid var(--border);color:var(--white);padding:9px 12px;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:11px;display:flex;align-items:center;gap:6px;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);transition:border-color .2s}
.dd-btn:hover{border-color:var(--gold)}
.dd-txt{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dd-arrow{color:var(--gold);font-size:8px;transition:transform .2s}
.dd-arrow.open{transform:rotate(180deg)}
.dd-menu{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--card2);border:1px solid rgba(201,168,76,.3);box-shadow:0 16px 48px rgba(0,0,0,.9);max-height:260px;overflow-y:auto;z-index:9999;animation:ddOpen .15s ease both}
@keyframes ddOpen{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.dd-item{padding:10px 14px;cursor:pointer;font-size:11px;color:var(--dim);border-bottom:1px solid rgba(201,168,76,.05);display:flex;align-items:center;justify-content:space-between;gap:8px;transition:background .15s,color .15s,padding-left .15s}
.dd-item:hover{background:rgba(201,168,76,.08);color:var(--gold-light);padding-left:20px;box-shadow:inset 2px 0 0 var(--gold)}
.dd-item.sel{color:var(--gold);background:rgba(201,168,76,.06);box-shadow:inset 2px 0 0 var(--gold)}
.dd-item-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tbl-hint{font-size:9px;letter-spacing:1px;color:var(--dim);text-align:right;margin-bottom:4px}
.tbl-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);background:var(--card)}
.mgrid{display:grid;min-width:720px}
.mhdr{background:rgba(201,168,76,.08);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;padding:10px 8px;color:var(--gold);white-space:nowrap}
.munit{border-bottom:1px solid rgba(201,168,76,.08);padding:10px 8px;font-size:11px;display:flex;flex-direction:column;gap:3px}
.munit-sub{font-size:9px;color:var(--dim)}
.mcell{border-left:1px solid rgba(201,168,76,.05);border-bottom:1px solid rgba(201,168,76,.05);padding:4px;min-height:90px;display:flex;flex-direction:column;gap:2px;position:relative}
.mcell-alert{border-left-color:rgba(229,115,115,.3);background:rgba(229,115,115,.03)}
.cell-alert-dot{position:absolute;top:3px;right:3px;font-size:9px;color:var(--red);opacity:.8;cursor:help}
.shift-row{display:flex;flex-direction:column;flex:1;padding:4px 5px;border-radius:2px;background:rgba(201,168,76,.04);gap:3px;min-height:38px}
.shift-row-night{background:rgba(30,144,255,.04)}
.shift-row-rest {background:rgba(150,150,150,.05)}
.shift-label{font-size:8px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.6}
.shift-label-day  {color:var(--gold)}
.shift-label-night{color:var(--blue)}
.shift-empty{font-size:9px;color:rgba(229,115,115,.7);font-style:italic}
.shift-add{align-self:flex-start;background:none;border:1px dashed rgba(255,255,255,.15);color:rgba(255,255,255,.3);width:16px;height:16px;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:2px;transition:all .15s;padding:0}
.shift-add:hover{border-color:var(--gold);color:var(--gold);background:rgba(201,168,76,.08)}
.shift-row-night .shift-add:hover{border-color:var(--blue);color:var(--blue)}
.pill-inline{display:flex;align-items:center;gap:3px}
.pill{display:inline-flex;align-items:center;gap:3px;padding:3px 6px;font-size:9px;border-radius:2px;margin-bottom:2px;line-height:1.3}
.pill-day  {background:rgba(201,168,76,.18);color:var(--gold)}
.pill-night{background:rgba(30,144,255,.18); color:var(--blue)}
.pill-rest {background:rgba(150,150,150,.15);color:#888}
.pill-draft{font-size:7px;color:var(--gold);opacity:.8;animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.8}50%{opacity:.3}}
.pill-del{background:none;border:none;cursor:pointer;font-size:9px;opacity:.4;padding:0 1px;line-height:1;color:inherit;transition:opacity .15s;flex-shrink:0}
.pill-del:hover{opacity:1}
.unit-cards{display:flex;flex-direction:column;gap:10px;margin-top:4px}
.unit-card{background:var(--card);border:1px solid var(--border);padding:14px 12px 10px}
.uc-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:8px}
.uc-name{font-size:13px;font-weight:600;color:var(--white)}
.uc-days{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.uc-day{display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;padding:5px 2px;border-radius:2px;transition:background .15s}
.uc-day:hover{background:rgba(201,168,76,.07)}
.uc-dname{font-size:7px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px}
.uc-dnum{font-size:12px;font-weight:600;color:var(--white)}
.uc-dot{width:18px;height:4px;border-radius:1px}
.dot-ok  {background:var(--gold)}
.dot-rest{background:rgba(100,100,200,.6)}
.dot-miss{background:rgba(229,115,115,.6);border:1px dashed var(--red)}
.uc-guard-count{font-size:8px;color:var(--gold);font-weight:600}
.uc-draft-dot{font-size:7px;color:var(--gold);animation:pulse 1.5s ease-in-out infinite}
.legend{display:flex;gap:16px;padding:12px 0 0;flex-wrap:wrap}
.legend-item{display:flex;align-items:center;gap:5px;font-size:9px;color:var(--dim);letter-spacing:.5px}
.legend-dot{width:10px;height:10px;border-radius:2px;flex-shrink:0}
.draft-dot{background:transparent;border:1px solid var(--gold);position:relative}
.draft-dot::after{content:'●';position:absolute;font-size:6px;color:var(--gold);top:50%;left:50%;transform:translate(-50%,-50%)}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);display:flex;justify-content:center;align-items:flex-end;z-index:10000}
.modal{background:#161625;border:1px solid rgba(201,168,76,.2);border-bottom:none;padding:24px 20px;width:100%;max-width:480px;display:flex;flex-direction:column;gap:12px;border-radius:16px 16px 0 0;box-shadow:0 -20px 60px rgba(0,0,0,.8);animation:slideUp .25s ease both;overflow-y:auto;max-height:90vh}
@keyframes slideUp{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
.modal-handle{width:36px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;margin:0 auto -4px;flex-shrink:0}
.modal-title{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;color:var(--white)}
.modal-info{font-size:11px;color:var(--dim);display:flex;flex-direction:column;gap:4px}
.modal-info strong{color:var(--gold)}
.modal-existing{background:rgba(201,168,76,.05);border:1px solid var(--border);padding:10px}
.modal-existing-lbl{font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--dim);margin-bottom:6px}
.modal-existing-list{display:flex;flex-wrap:wrap;gap:4px}
.modal select{padding:12px 10px;border:1px solid var(--border);background:var(--card);color:var(--white);font-family:'Montserrat',sans-serif;font-size:13px;outline:none;cursor:pointer;width:100%}
.modal select:focus{border-color:var(--gold)}
.modal select option{background:#1a1a1a;color:var(--white)}
.modal-note{font-size:9px;color:var(--dim);text-align:center;padding-top:4px}
.modal-actions{display:flex;gap:8px}
.validation-panel{background:rgba(229,115,115,.06);border:1px solid rgba(229,115,115,.2);padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.validation-title{font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--red);margin-bottom:2px}
.validation-item{display:flex;gap:7px;font-size:10px;line-height:1.4}
.val-critical .val-icon{color:var(--red);flex-shrink:0;font-weight:700}
.val-warning  .val-icon{color:var(--gold);flex-shrink:0}
.val-critical{color:rgba(229,115,115,.9)}
.val-warning {color:rgba(201,168,76,.9)}
.validation-note{font-size:9px;color:var(--dim);margin-top:4px;font-style:italic}
.validation-ok{font-size:10px;color:var(--green);background:rgba(129,199,132,.08);border:1px solid rgba(129,199,132,.2);padding:8px 12px}
.btn-p{flex:1;padding:13px;background:var(--gold);color:var(--black);border:none;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:opacity .2s;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)}
.btn-p:disabled{opacity:.4;cursor:not-allowed}
.btn-p:not(:disabled):hover{opacity:.85}
.btn-s{flex:1;padding:13px;background:transparent;color:var(--dim);border:1px solid var(--border);font-family:'Montserrat',sans-serif;font-size:11px;cursor:pointer;transition:border-color .2s;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)}
.btn-s:hover{border-color:var(--gold);color:var(--white)}
.toast-success{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--card);border:1px solid rgba(129,199,132,.4);color:var(--green);padding:12px 20px;font-size:11px;font-weight:600;letter-spacing:.5px;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:20000;animation:toastIn .3s ease both;clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@media(min-width:768px){
  .dp{padding:36px 32px 48px}
  .dp-nav-label{display:inline}
  .tab-row{display:none}
  .chart-panel,.calendar-panel{display:block!important}
  .unit-cards{display:none!important}
  .tbl-scroll{display:block!important}
  .tbl-hint{display:none}
  .mgrid{min-width:900px}
  .mhdr{font-size:11px;padding:12px 10px}
  .munit{font-size:12px;padding:12px 10px}
  .pill{font-size:10px;padding:4px 7px}
  .mcell{min-height:100px;padding:6px;gap:4px}
  .shift-row{min-height:44px}
  .modal-overlay{align-items:center}
  .modal{border-bottom:1px solid rgba(201,168,76,.2);border-radius:4px;max-width:440px;animation:none;padding-bottom:24px;max-height:80vh}
  .modal-handle{display:none}
  .week-bar{flex-wrap:nowrap}
}
`;