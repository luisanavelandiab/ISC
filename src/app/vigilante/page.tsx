/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState, useMemo } from "react";
import {
  collection, query, where, getDoc, doc, onSnapshot,
  updateDoc, Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { db, auth } from "@/services/firebase";
import { useRouter } from "next/navigation";

// ─── Tipos ───────────────────────────────────────
interface Personnel {
  id: string;
  name: string;
  fullName?: string;
  uid: string;
  state?: string;
  assignedUnit?: string;
  preferredShift?: string;
  canRotate?: boolean;
  photoURL?: string;
  category?: string;
  role?: string;
}
interface Assignment {
  id: string;
  unitId: string;
  unitName: string;
  guardId?: string;
  personnelId?: string;
  // Estructura nueva
  shift?: "dia" | "noche" | "descanso";
  date?: Timestamp;
  status?: string;
  publishedAt?: Timestamp;
  // Estructura anterior
  shiftType?: string;
  startDate?: Timestamp;
}
interface ObservacionVigilante {
  id: string;
  tipo: "Positiva" | "Negativa" | "Neutral";
  descripcion: string;
  inspector: string;
  fecha: Timestamp;
}

// ─── Helpers semana ──────────────────────────────
function getMonday(d: Date) {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - day + (day === 0 ? -6 : 1));
  r.setHours(0, 0, 0, 0);
  return r;
}
function getWeekDays(offset = 0): Date[] {
  const base = getMonday(new Date());
  base.setDate(base.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });
}
function dateKey(d: Date) { return d.toISOString().slice(0, 10); }

// Normaliza shift entre ambas estructuras de Firestore
function resolveShift(a: Assignment): string {
  if (a.shift) return a.shift;
  if (a.shiftType) return a.shiftType;
  return "dia";
}
// Normaliza la fecha de un assignment entre ambas estructuras
function resolveDate(a: Assignment): Date | null {
  if (a.date) return a.date.toDate();
  if (a.startDate) return a.startDate.toDate();
  return null;
}

const DAY_NAMES   = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_NAMES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtTimestamp(ts: Timestamp) {
  const d = ts.toDate();
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateLong(d: Date) {
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long" });
}
function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]?.toUpperCase() || "").join("");
}

const TIPO_CLS: Record<string, string> = {
  Positiva: "obs-pos", Negativa: "obs-neg", Neutral: "obs-neu",
};

const SHIFT_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  dia:      { icon: "☀️", label: "Turno Día",       color: "#C9A84C", bg: "rgba(201,168,76,.15)",  border: "rgba(201,168,76,.35)"  },
  noche:    { icon: "🌙", label: "Turno Noche",     color: "#4DA3FF", bg: "rgba(30,144,255,.15)",  border: "rgba(30,144,255,.35)"  },
  descanso: { icon: "💤", label: "Día de Descanso", color: "#888",    bg: "rgba(150,150,150,.1)",  border: "rgba(150,150,150,.25)" },
  "24h":    { icon: "⏱️", label: "24 Horas",        color: "#C4A0FF", bg: "rgba(180,130,255,.15)", border: "rgba(180,130,255,.35)" },
};

// ─── Componente principal ─────────────────────────
export default function VigilantePage() {
  const router = useRouter();

  const [user,        setUser]        = useState<User | null>(null);
  const [guard,       setGuard]       = useState<Personnel | null>(null);
  const [guardId,     setGuardId]     = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [obsVig,      setObsVig]      = useState<ObservacionVigilante[]>([]);
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<"calendario" | "observaciones">("calendario");
  const [newChanges,  setNewChanges]  = useState(0);
  const [lastSeenAt,  setLastSeenAt]  = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const todayKey = dateKey(new Date());

  // ── Auth listener ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) { setLoading(false); router.push("/"); }
    });
    return () => unsub();
  }, []);

  // ── Cargar perfil del vigilante ──
  // Soporta dos estructuras:
  //   Nueva  → users/{uid} tiene guardId → personnel/{guardId}
  //   Anterior → personnel/{uid} directamente
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Intentar estructura nueva primero
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          const ud = userSnap.data();
          const gId = ud.guardId || ud.personnelId;
          const lastSeen = ud.lastSeenAt?.toDate?.() || null;
          setLastSeenAt(lastSeen);

          if (gId) {
            setGuardId(gId);
            const persSnap = await getDoc(doc(db, "personnel", gId));
            if (persSnap.exists()) {
              setGuard({ id: persSnap.id, ...persSnap.data() } as Personnel);
              setLoading(false);
              return;
            }
          }
          // Sin guardId en users: usar datos del doc user como fallback
          setGuard({
            id: user.uid,
            uid: user.uid,
            name: ud.displayName || user.email || "Vigilante",
            fullName: ud.displayName,
            state: "Activo",
          });
          setGuardId(user.uid);
          setLoading(false);
          return;
        }

        // Fallback: estructura anterior — personnel/{uid}
        const persSnap = await getDoc(doc(db, "personnel", user.uid));
        if (persSnap.exists()) {
          setGuard({ id: persSnap.id, ...persSnap.data() } as Personnel);
          setGuardId(user.uid);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // ── Cargar asignaciones ──
  // Soporta ambas estructuras: nueva (guardId + publicado) y anterior (personnelId + activo)
  useEffect(() => {
    if (!guardId) return;
    const subs: (() => void)[] = [];

    // Nueva estructura
    subs.push(onSnapshot(
      query(
        collection(db, "assignments"),
        where("guardId", "==", guardId),
        where("status", "==", "publicado"),
      ),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assignment));
        setAssignments((prev) => {
          const legacyOnly = prev.filter((a) => a.status === "activo");
          return [...data, ...legacyOnly.filter((a) => !data.some((nd) => nd.id === a.id))];
        });
        if (lastSeenAt) {
          const nuevos = data.filter(
            (a) => a.publishedAt && a.publishedAt.toDate() > lastSeenAt
          ).length;
          setNewChanges(nuevos);
        }
      }
    ));

    // Estructura anterior
    subs.push(onSnapshot(
      query(
        collection(db, "assignments"),
        where("personnelId", "==", guardId),
        where("status", "==", "activo"),
      ),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assignment));
        setAssignments((prev) => {
          const newOnly = prev.filter((a) => a.status === "publicado");
          return [...newOnly, ...data.filter((a) => !newOnly.some((nd) => nd.id === a.id))];
        });
      }
    ));

    return () => subs.forEach((u) => u());
  }, [guardId, lastSeenAt]);

  // ── Cargar observaciones ──
  useEffect(() => {
    if (!guardId) return;
    const unsub = onSnapshot(
      query(collection(db, "observaciones_vigilantes"), where("guardId", "==", guardId)),
      (snap) => setObsVig(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as ObservacionVigilante))
          .sort((a, b) => b.fecha.toMillis() - a.fecha.toMillis())
      )
    );
    return () => unsub();
  }, [guardId]);

  // ── Marcar cambios como vistos ──
  async function markAsSeen() {
    if (!user || newChanges === 0) return;
    await updateDoc(doc(db, "users", user.uid), { lastSeenAt: Timestamp.now() });
    setLastSeenAt(new Date());
    setNewChanges(0);
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/");
  }

  // ── Planificación semanal ──
  // Para asignaciones con fecha específica (nueva estructura) las cruza con el día.
  // Para asignaciones sin fecha (anterior estructura) repite la asignación activa en toda la semana.
  const weekSchedule = useMemo(() => {
    return weekDays.map((day, i) => {
      const key = dateKey(day);
      // Buscar asignación con fecha exacta (nueva estructura)
      const byDate = assignments.find(
        (a) => a.date && dateKey(a.date.toDate()) === key
      );
      // Fallback a asignación activa sin fecha específica (estructura anterior)
      const fallback = !byDate ? (assignments.find((a) => !a.date && a.status === "activo") ?? null) : null;
      return { day, key, assignment: byDate ?? fallback, dayIndex: i };
    });
  }, [weekDays, assignments]);

  // ── Próximo turno ──
  const nextShift = useMemo(() => {
    const now = new Date();
    return assignments
      .filter((a) => {
        const d = resolveDate(a);
        return d && d >= now && resolveShift(a) !== "descanso";
      })
      .sort((a, b) => {
        const da = resolveDate(a)!.getTime();
        const db_ = resolveDate(b)!.getTime();
        return da - db_;
      })[0] || null;
  }, [assignments]);

  // ── Stats semana ──
  const weekStats = useMemo(() => {
    const dias      = weekSchedule.filter((s) => s.assignment && resolveShift(s.assignment) === "dia").length;
    const noches    = weekSchedule.filter((s) => s.assignment && resolveShift(s.assignment) === "noche").length;
    const descansos = weekSchedule.filter((s) => s.assignment && resolveShift(s.assignment) === "descanso").length;
    return { dias, noches, descansos, total: dias + noches };
  }, [weekSchedule]);

  const guardName      = guard?.fullName || guard?.name || "Vigilante";
  const mainAssignment = assignments[0] ?? null;
  const mainShift      = mainAssignment ? resolveShift(mainAssignment) : null;

  // ─── Estados de carga ────────────────────────
  if (loading) return (
    <>
      <style>{CSS}</style>
      <div className="vp">
        <div className="vp-loading"><div className="vp-spinner" /><span>Cargando…</span></div>
      </div>
    </>
  );

  if (!user) return (
    <>
      <style>{CSS}</style>
      <div className="vp">
        <div className="vp-empty">
          <span style={{ fontSize: 40 }}>🔒</span>
          <p>Debes iniciar sesión para ver tu panel.</p>
        </div>
      </div>
    </>
  );

  if (!guard) return (
    <>
      <style>{CSS}</style>
      <div className="vp">
        <div className="vp-empty">
          <span style={{ fontSize: 40 }}>👤</span>
          <p>No se encontró tu perfil de agente.<br />Contacta al administrador.</p>
        </div>
      </div>
    </>
  );

  // ─── Render ──────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="vp">

        {/* ── Header perfil ── */}
        <div className="vp-header">
          <div className="vp-avatar-wrap">
            {guard.photoURL
              ? <img src={guard.photoURL} alt={guardName} className="vp-avatar vp-avatar-img" />
              : <div className="vp-avatar">{getInitials(guardName)}</div>
            }
            <span className={"avatar-dot " + ((guard.state === "Activo" || !guard.state) ? "dot-active" : "dot-inactive")} />
          </div>

          <div className="vp-info">
            <p className="vp-eye">Bienvenido</p>
            <h1 className="vp-name">{guardName}</h1>
            <div className="vp-badges">
              <span className={"vp-badge " + ((guard.state === "Activo" || !guard.state) ? "b-active" : "b-inactive")}>
                ● {guard.state ?? "Activo"}
              </span>
              {mainShift && mainShift !== "descanso" && (
                <span className="vp-badge b-shift">
                  {SHIFT_CONFIG[mainShift]?.icon} {SHIFT_CONFIG[mainShift]?.label}
                </span>
              )}
              {guard.category && guard.category !== "Sin categoría" && (
                <span className="vp-badge b-cat">Cat. {guard.category}</span>
              )}
            </div>
          </div>

          <button className="btn-logout" onClick={handleLogout} title="Cerrar sesión">
            <span>⎋</span>
            <span className="logout-lbl">Salir</span>
          </button>
        </div>

        {/* ── Banner cambios nuevos ── */}
        {newChanges > 0 && (
          <div className="new-changes-banner" onClick={markAsSeen}>
            <span className="changes-pulse" />
            <span className="changes-text">
              🔔 <strong>{newChanges}</strong> cambio{newChanges !== 1 ? "s" : ""} nuevo{newChanges !== 1 ? "s" : ""} en tu calendario
            </span>
            <button
              className="changes-dismiss"
              onClick={(e) => { e.stopPropagation(); markAsSeen(); }}
            >
              Marcar como visto ✓
            </button>
          </div>
        )}

        {/* ── Info rápida ── */}
        <div className="quick-cards">
          <div className="qc">
            <div className="qc-lbl">Unidad asignada</div>
            <div className="qc-val">
              {mainAssignment?.unitName ?? <span className="dim">Sin asignar</span>}
            </div>
          </div>
          <div className="qc">
            <div className="qc-lbl">Turno</div>
            <div className="qc-val">
              {mainShift
                ? `${SHIFT_CONFIG[mainShift]?.icon} ${SHIFT_CONFIG[mainShift]?.label}`
                : <span className="dim">—</span>
              }
            </div>
          </div>
          <div className="qc">
            <div className="qc-lbl">Inicio de asignación</div>
            <div className="qc-val">
              {mainAssignment?.startDate
                ? fmtTimestamp(mainAssignment.startDate)
                : mainAssignment?.date
                  ? fmtTimestamp(mainAssignment.date)
                  : <span className="dim">—</span>
              }
            </div>
          </div>
        </div>

        {/* ── Próximo turno destacado ── */}
        {nextShift && (() => {
          const shift    = resolveShift(nextShift);
          const shiftCfg = SHIFT_CONFIG[shift];
          const date     = resolveDate(nextShift);
          const isHoy    = date && dateKey(date) === todayKey;
          return (
            <div className="next-shift-card" style={{ borderColor: shiftCfg?.border }}>
              <div className="next-shift-label">
                <span className="next-label-text">Próximo turno</span>
                {isHoy && <span className="today-badge">HOY</span>}
              </div>
              <div className="next-shift-content">
                <div className="next-shift-icon" style={{ color: shiftCfg?.color }}>
                  {shiftCfg?.icon}
                </div>
                <div className="next-shift-info">
                  <p className="next-shift-type" style={{ color: shiftCfg?.color }}>
                    {shiftCfg?.label}
                  </p>
                  {date && <p className="next-shift-date">{fmtDateLong(date)}</p>}
                  <p className="next-shift-unit">📍 {nextShift.unitName}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Stats semana ── */}
        <div className="week-stats">
          <div className="stat-item">
            <span className="stat-val">{weekStats.dias}</span>
            <span className="stat-lbl">☀️ Días</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-val">{weekStats.noches}</span>
            <span className="stat-lbl">🌙 Noches</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-val">{weekStats.descansos}</span>
            <span className="stat-lbl">💤 Desc.</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-val">{weekStats.total}</span>
            <span className="stat-lbl">Total</span>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="tab-row">
          <button
            className={"tab-btn" + (tab === "calendario" ? " active" : "")}
            onClick={() => setTab("calendario")}
          >
            📅 Mi semana
          </button>
          <button
            className={"tab-btn" + (tab === "observaciones" ? " active" : "")}
            onClick={() => setTab("observaciones")}
          >
            📋 Observaciones
            {obsVig.length > 0 && <span className="tab-badge">{obsVig.length}</span>}
          </button>
        </div>

        {/* ════════ TAB: CALENDARIO ════════ */}
        {tab === "calendario" && (
          <>
            {/* Nav semana */}
            <div className="week-nav">
              <button className="nav-btn" onClick={() => setWeekOffset((w) => w - 1)}>◀</button>
              <div className="week-nav-center">
                <span className="week-label">
                  {weekOffset === 0 ? "Esta semana"
                    : weekOffset === 1 ? "Próxima semana"
                    : weekOffset === -1 ? "Semana pasada"
                    : `Semana ${weekOffset > 0 ? "+" : ""}${weekOffset}`}
                </span>
                <span className="week-range">
                  {weekDays[0].toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                  {" — "}
                  {weekDays[6].toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
              <button className="nav-btn" onClick={() => setWeekOffset((w) => w + 1)}>▶</button>
              {weekOffset !== 0 && (
                <button className="nav-today" onClick={() => setWeekOffset(0)}>Hoy</button>
              )}
              <button className="nav-print" onClick={() => window.print()} title="Imprimir rol">🖨️</button>
            </div>

            {/* Título imprimible */}
            <div className="rol-header">
              <div className="rol-line" />
              <h2 className="rol-title">Rol del Agente</h2>
              <div className="rol-line" />
            </div>

            {/* Grid días */}
            <div className="week-grid">
              {weekSchedule.map(({ day, key, assignment, dayIndex }) => {
                const isToday  = key === todayKey;
                const isPast   = day < new Date(todayKey);
                const shift    = assignment ? resolveShift(assignment) : null;
                const shiftCfg = shift ? SHIFT_CONFIG[shift] : null;
                const isExp    = selectedDay === key;
                const isNew    = assignment?.publishedAt
                  && lastSeenAt
                  && assignment.publishedAt.toDate() > lastSeenAt;

                return (
                  <div
                    key={key}
                    className={
                      "day-card" +
                      (isToday ? " today" : "") +
                      (isPast  ? " past"  : "") +
                      (shift === "descanso" ? " day-rest"  : "") +
                      (!assignment          ? " day-empty" : "")
                    }
                    onClick={() => setSelectedDay(isExp ? null : key)}
                  >
                    {isNew && <span className="new-dot" title="Cambio nuevo" />}

                    <div className="day-head">
                      <span className="day-name">{DAY_NAMES[dayIndex]}</span>
                      <span className={"day-num" + (isToday ? " day-num-today" : "")}>
                        {day.getDate()}
                      </span>
                      {isToday && <span className="day-now">Hoy</span>}
                    </div>

                    <div className="day-body">
                      {assignment && shiftCfg ? (
                        <>
                          <div
                            className={"day-shift shift-" + shift}
                            style={{ background: shiftCfg.bg }}
                          >
                            <span className="day-shift-icon">{shiftCfg.icon}</span>
                            <span
                              className="day-shift-label"
                              style={{ color: shiftCfg.color }}
                            >
                              {shiftCfg.label}
                            </span>
                          </div>
                          <div className="day-unit">{assignment.unitName}</div>
                        </>
                      ) : (
                        <div className="day-off">🏖️ Descanso</div>
                      )}
                    </div>

                    {/* Detalle expandido al tocar */}
                    {isExp && assignment && shiftCfg && (
                      <div className="day-detail">
                        <div className="detail-row">
                          <span className="detail-lbl">Turno</span>
                          <span className="detail-val" style={{ color: shiftCfg.color }}>
                            {shiftCfg.icon} {shiftCfg.label}
                          </span>
                        </div>
                        {assignment.unitName && (
                          <div className="detail-row">
                            <span className="detail-lbl">Unidad</span>
                            <span className="detail-val">📍 {assignment.unitName}</span>
                          </div>
                        )}
                        {resolveDate(assignment) && (
                          <div className="detail-row">
                            <span className="detail-lbl">Fecha</span>
                            <span className="detail-val">{fmtDateLong(resolveDate(assignment)!)}</span>
                          </div>
                        )}
                        {assignment.publishedAt && (
                          <div className="detail-row">
                            <span className="detail-lbl">Publicado</span>
                            <span className="detail-val detail-dim">
                              {assignment.publishedAt.toDate().toLocaleDateString("es-ES", {
                                day: "2-digit", month: "short",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sin turnos esta semana */}
            {weekSchedule.every((s) => !s.assignment) && (
              <div className="no-shifts">
                <span style={{ fontSize: 28, opacity: .25 }}>📅</span>
                <p className="no-shifts-title">Sin turnos esta semana</p>
                <p className="no-shifts-sub">
                  {weekOffset < 0
                    ? "No hay turnos registrados para esta semana."
                    : "Aún no se han publicado turnos para esta semana."}
                </p>
              </div>
            )}

            {/* Leyenda */}
            <div className="legend">
              <span className="legend-item"><span className="legend-dot dot-day" />☀️ Día</span>
              <span className="legend-item"><span className="legend-dot dot-night" />🌙 Noche</span>
              <span className="legend-item"><span className="legend-dot dot-24" />⏱️ 24h</span>
              <span className="legend-item"><span className="legend-dot dot-off" />Descanso</span>
              <span className="legend-item"><span className="legend-dot dot-new" />Nuevo</span>
            </div>
          </>
        )}

        {/* ════════ TAB: OBSERVACIONES ════════ */}
        {tab === "observaciones" && (
          obsVig.length === 0
            ? <div className="vp-empty" style={{ padding: "40px 0" }}>
                <span style={{ fontSize: 32 }}>📋</span>
                <p>No tienes observaciones registradas.</p>
              </div>
            : <div className="obs-list">
                {obsVig.map((o) => (
                  <div key={o.id} className={"obs-card " + TIPO_CLS[o.tipo]}>
                    <div className="obs-head">
                      <span className={"obs-badge " + TIPO_CLS[o.tipo]}>{o.tipo}</span>
                      <span className="obs-date">{fmtTimestamp(o.fecha)}</span>
                    </div>
                    <p className="obs-desc">{o.descripcion}</p>
                    <p className="obs-inspector">Registrado por: {o.inspector}</p>
                  </div>
                ))}
              </div>
        )}

        {/* Nota final */}
        <p className="vp-note">
          ℹ️ Calendario de solo lectura. Para cambios contacta a tu coordinador o administrador.
        </p>

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
  --white: #F5F0E8; --dim: rgba(245,240,232,.45);
  --border: rgba(201,168,76,.18);
  --danger: #E57373; --success: #81C784;
}
.vp { background: var(--black); min-height: 100vh; font-family: 'Montserrat', sans-serif; color: var(--white); padding: 24px 16px 60px; max-width: 680px; margin: 0 auto; }
.vp::before { content:''; position:fixed; inset:0; background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px); background-size:48px 48px; pointer-events:none; z-index:0; }
.vp > * { position: relative; z-index: 1; }

/* ── Header ── */
.vp-header { display:flex; align-items:center; gap:14px; margin-bottom:16px; }
.vp-avatar-wrap { position:relative; flex-shrink:0; }
.vp-avatar { width:52px; height:52px; background:rgba(201,168,76,.15); border:1px solid var(--border); border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:'Cormorant Garamond',serif; font-size:20px; color:var(--gold); flex-shrink:0; }
.vp-avatar-img { object-fit:cover; border-radius:50%; }
.avatar-dot { position:absolute; bottom:1px; right:1px; width:11px; height:11px; border-radius:50%; border:2px solid var(--black); }
.dot-active   { background:var(--success); }
.dot-inactive { background:var(--danger); }
.vp-eye  { font-size:9px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:var(--gold); margin-bottom:3px; }
.vp-name { font-family:'Cormorant Garamond',serif; font-size:clamp(18px,5vw,26px); font-weight:300; line-height:1.1; margin-bottom:6px; }
.vp-badges { display:flex; gap:5px; flex-wrap:wrap; }
.vp-badge  { font-size:8px; font-weight:600; padding:2px 8px; border:1px solid; letter-spacing:.5px; }
.b-active  { background:rgba(129,199,132,.1); color:var(--success); border-color:rgba(129,199,132,.3); }
.b-inactive{ background:rgba(229,115,115,.1); color:var(--danger);  border-color:rgba(229,115,115,.3); }
.b-shift   { background:rgba(201,168,76,.1);  color:var(--gold);    border-color:rgba(201,168,76,.3); }
.b-cat     { background:rgba(255,255,255,.05); color:var(--dim);    border-color:rgba(255,255,255,.1); }
.btn-logout { display:flex; flex-direction:column; align-items:center; gap:2px; padding:8px 10px; background:transparent; border:1px solid rgba(229,115,115,.2); color:var(--dim); cursor:pointer; font-family:'Montserrat',sans-serif; font-size:13px; transition:all .2s; flex-shrink:0; margin-left:auto; }
.btn-logout:hover { border-color:var(--danger); color:var(--danger); }
.logout-lbl { font-size:7px; letter-spacing:1px; text-transform:uppercase; }

/* ── Banner cambios nuevos ── */
.new-changes-banner { display:flex; align-items:center; gap:10px; padding:11px 14px; background:rgba(201,168,76,.08); border:1px solid rgba(201,168,76,.3); margin-bottom:14px; cursor:pointer; transition:background .2s; flex-wrap:wrap; }
.new-changes-banner:hover { background:rgba(201,168,76,.12); }
.changes-pulse { width:8px; height:8px; border-radius:50%; background:var(--gold); flex-shrink:0; animation:livePulse 1.2s ease-in-out infinite; }
@keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }
.changes-text { flex:1; font-size:11px; color:var(--white); }
.changes-text strong { color:var(--gold); }
.changes-dismiss { background:none; border:1px solid rgba(201,168,76,.3); color:var(--gold); font-family:'Montserrat',sans-serif; font-size:9px; font-weight:600; padding:4px 10px; cursor:pointer; letter-spacing:.5px; white-space:nowrap; }
.changes-dismiss:hover { background:rgba(201,168,76,.1); }

/* ── Quick cards ── */
.quick-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:14px; }
.qc { background:var(--card); border:1px solid var(--border); padding:12px 14px; clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%); }
.qc-lbl { font-size:8px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:var(--gold); margin-bottom:5px; }
.qc-val { font-size:12px; color:var(--white); font-weight:500; line-height:1.3; }
.dim { color:var(--dim); font-weight:400; }

/* ── Próximo turno ── */
.next-shift-card { background:var(--card); border:1px solid; padding:14px; margin-bottom:14px; }
.next-shift-label { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.next-label-text { font-size:9px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:var(--dim); }
.today-badge { font-size:8px; font-weight:800; padding:2px 8px; background:var(--gold); color:var(--black); letter-spacing:1px; }
.next-shift-content { display:flex; align-items:center; gap:14px; }
.next-shift-icon { font-size:28px; flex-shrink:0; }
.next-shift-info { display:flex; flex-direction:column; gap:3px; }
.next-shift-type { font-size:14px; font-weight:700; letter-spacing:.5px; }
.next-shift-date { font-size:12px; color:var(--white); text-transform:capitalize; }
.next-shift-unit { font-size:11px; color:var(--dim); }

/* ── Stats semana ── */
.week-stats { display:flex; align-items:center; justify-content:space-around; background:var(--card); border:1px solid var(--border); padding:12px; margin-bottom:18px; }
.stat-item  { display:flex; flex-direction:column; align-items:center; gap:3px; }
.stat-val   { font-family:'Cormorant Garamond',serif; font-size:26px; font-weight:300; color:var(--gold); line-height:1; }
.stat-lbl   { font-size:8px; color:var(--dim); letter-spacing:.5px; text-align:center; }
.stat-divider { width:1px; height:28px; background:rgba(255,255,255,.07); }

/* ── Tabs ── */
.tab-row { display:flex; gap:2px; margin-bottom:18px; border-bottom:1px solid var(--border); }
.tab-btn { flex:1; padding:10px 8px; background:none; border:none; color:var(--dim); font-family:'Montserrat',sans-serif; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; transition:color .2s; display:flex; align-items:center; justify-content:center; gap:6px; }
.tab-btn.active { color:var(--gold); border-bottom-color:var(--gold); }
.tab-badge { background:var(--gold); color:var(--black); font-size:9px; font-weight:700; padding:1px 6px; border-radius:10px; }

/* ── Week nav ── */
.week-nav { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
.nav-btn { width:32px; height:32px; background:var(--card); border:1px solid var(--border); color:var(--gold); cursor:pointer; font-size:11px; display:flex; align-items:center; justify-content:center; transition:background .2s; flex-shrink:0; }
.nav-btn:hover { background:rgba(201,168,76,.1); }
.week-nav-center { flex:1; display:flex; flex-direction:column; align-items:center; gap:1px; }
.week-label { font-size:11px; font-weight:600; color:var(--white); letter-spacing:.5px; }
.week-range { flex:1; text-align:center; font-size:10px; color:var(--dim); letter-spacing:.3px; }
.nav-today { background:none; border:1px solid var(--border); color:var(--dim); font-family:'Montserrat',sans-serif; font-size:10px; padding:6px 12px; cursor:pointer; transition:all .2s; }
.nav-today:hover { border-color:var(--gold); color:var(--gold); }
.nav-print { background:none; border:1px solid var(--border); color:var(--dim); font-size:14px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .2s; flex-shrink:0; }
.nav-print:hover { border-color:var(--gold); color:var(--gold); background:rgba(201,168,76,.08); }

/* ── Título del rol ── */
.rol-header { display:flex; align-items:center; gap:14px; margin: 20px 0 18px; }
.rol-line   { flex:1; height:1px; background:linear-gradient(90deg, transparent, rgba(201,168,76,.35), transparent); }
.rol-title  { font-family:'Cormorant Garamond',serif; font-size:clamp(20px,4vw,26px); font-weight:400; color:var(--gold); letter-spacing:4px; text-transform:uppercase; white-space:nowrap; flex-shrink:0; }

/* ── Week grid ── */
.week-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:5px; margin-bottom:12px; }
.day-card { background:var(--card); border:1px solid var(--border); padding:8px 6px; display:flex; flex-direction:column; gap:4px; min-height:90px; transition:border-color .2s; cursor:pointer; position:relative; }
.day-card.today    { border-color:var(--gold); background:rgba(201,168,76,.05); }
.day-card.past     { opacity:.52; }
.day-card.day-rest { background:rgba(150,150,150,.04); }
.day-card.day-empty{ border-style:dashed; }
.day-card:hover    { border-color:rgba(201,168,76,.35); }
.new-dot { position:absolute; top:5px; right:5px; width:6px; height:6px; border-radius:50%; background:var(--gold); animation:livePulse 1.2s ease-in-out infinite; }
.day-head { display:flex; flex-direction:column; align-items:center; gap:1px; border-bottom:1px solid rgba(255,255,255,.05); padding-bottom:4px; }
.day-name { font-size:8px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--dim); }
.day-num  { font-family:'Cormorant Garamond',serif; font-size:20px; font-weight:300; color:var(--white); line-height:1; }
.day-num-today { color:var(--gold); }
.day-now  { font-size:7px; font-weight:600; letter-spacing:.5px; color:var(--gold); text-transform:uppercase; }
.day-body { flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:3px; }
.day-shift       { display:flex; flex-direction:column; align-items:center; gap:2px; padding:4px 3px; border-radius:2px; width:100%; }
.day-shift-icon  { font-size:14px; }
.day-shift-label { font-size:7px; font-weight:700; letter-spacing:.3px; text-transform:uppercase; text-align:center; }
.day-unit { font-size:8px; color:var(--dim); text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%; }
.day-off  { font-size:10px; color:var(--dim); text-align:center; }

/* Detalle expandido */
.day-detail { margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,.07); display:flex; flex-direction:column; gap:5px; animation:fadeDetail .2s ease both; }
@keyframes fadeDetail { from{opacity:0;transform:translateY(-3px)} to{opacity:1;transform:none} }
.detail-row  { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.detail-lbl  { font-size:8px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--dim); }
.detail-val  { font-size:10px; color:var(--white); text-align:right; }
.detail-dim  { color:var(--dim); font-size:9px; }

/* Sin turnos */
.no-shifts      { display:flex; flex-direction:column; align-items:center; padding:28px 20px; gap:8px; text-align:center; }
.no-shifts-title{ font-family:'Cormorant Garamond',serif; font-size:20px; font-weight:300; opacity:.5; }
.no-shifts-sub  { font-size:11px; color:var(--dim); max-width:240px; line-height:1.5; }

/* ── Leyenda ── */
.legend { display:flex; gap:14px; flex-wrap:wrap; justify-content:center; margin-bottom:6px; }
.legend-item { display:flex; align-items:center; gap:5px; font-size:10px; color:var(--dim); }
.legend-dot  { width:10px; height:10px; border-radius:1px; }
.dot-day   { background:rgba(201,168,76,.5); }
.dot-night { background:rgba(30,144,255,.5); }
.dot-24    { background:rgba(180,130,255,.5); }
.dot-off   { background:rgba(150,150,150,.3); border:1px solid rgba(150,150,150,.3); }
.dot-new   { background:var(--gold); border-radius:50%; animation:livePulse 1.2s ease-in-out infinite; }

/* ── Nota ── */
.vp-note { font-size:10px; color:var(--dim); text-align:center; padding-top:10px; line-height:1.5; border-top:1px solid rgba(255,255,255,.05); margin-top:6px; }

/* ── Observaciones ── */
.obs-list { display:flex; flex-direction:column; gap:8px; }
.obs-card { background:var(--card); border-left:3px solid; padding:14px 16px; display:flex; flex-direction:column; gap:6px; }
.obs-pos  { border-color:var(--success); }
.obs-neg  { border-color:var(--danger); }
.obs-neu  { border-color:rgba(150,150,200,.5); }
.obs-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.obs-badge { font-size:9px; font-weight:600; padding:2px 8px; border:1px solid; letter-spacing:.5px; }
.obs-pos .obs-badge { background:rgba(129,199,132,.1); color:var(--success); border-color:rgba(129,199,132,.3); }
.obs-neg .obs-badge { background:rgba(229,115,115,.1); color:var(--danger);  border-color:rgba(229,115,115,.3); }
.obs-neu .obs-badge { background:rgba(150,150,200,.1); color:#9FA8DA;        border-color:rgba(150,150,200,.3); }
.obs-date      { font-size:10px; color:var(--dim); }
.obs-desc      { font-size:12px; color:var(--white); line-height:1.6; }
.obs-inspector { font-size:10px; color:var(--dim); }

/* ── Loading / empty ── */
.vp-loading { display:flex; align-items:center; gap:12px; padding:60px 20px; color:var(--dim); font-size:13px; }
.vp-spinner { width:18px; height:18px; border:2px solid var(--border); border-top-color:var(--gold); border-radius:50%; animation:spin .7s linear infinite; flex-shrink:0; }
@keyframes spin { to { transform:rotate(360deg) } }
.vp-empty { display:flex; flex-direction:column; align-items:center; gap:12px; padding:60px 20px; color:var(--dim); font-size:13px; text-align:center; line-height:1.6; }

/* ── PRINT ── */
@media print {
  @page { size: A4 landscape; margin: 16mm; }
  body { background: #fff !important; color: #000 !important; }
  .vp-header, .quick-cards, .tab-row, .obs-list,
  .week-nav .nav-btn, .week-nav .nav-today, .week-nav .nav-print,
  .legend, .new-changes-banner, .next-shift-card, .week-stats,
  .btn-logout, .vp-note, .vp::before { display: none !important; }
  .vp { padding: 0; max-width: 100%; background: #fff !important; }
  .week-nav { justify-content: center; margin-bottom: 8px; }
  .week-nav-center { flex: none; }
  .week-range, .week-label { font-size: 12px; color: #555; }
  .rol-header { margin: 12px 0 16px; }
  .rol-line   { background: #ccc; }
  .rol-title  { color: #000; letter-spacing: 6px; font-size: 22px; }
  .week-grid { gap: 4px; }
  .day-card { background: #fff !important; border: 1px solid #ccc !important; min-height: 80px; cursor: default; }
  .day-card.today { border-color: #C9A84C !important; background: #fffbf0 !important; }
  .day-card.past  { opacity: 1 !important; }
  .day-name { color: #888 !important; }
  .day-num  { color: #000 !important; }
  .day-num-today { color: #C9A84C !important; }
  .day-now  { color: #C9A84C !important; }
  .day-shift { background: #f5f5f5 !important; }
  .day-shift-label { color: #333 !important; }
  .shift-dia   { background: #fff8e1 !important; }
  .shift-noche { background: #e8eaf6 !important; }
  .shift-24h   { background: #f3e5f5 !important; }
  .day-unit { color: #666 !important; }
  .day-off  { color: #aaa !important; }
  .new-dot, .day-detail { display: none !important; }
}

/* ── Responsive ── */
@media (max-width:480px) {
  .quick-cards { grid-template-columns:1fr 1fr; }
  .quick-cards .qc:last-child { grid-column:span 2; }
  .week-grid { grid-template-columns:repeat(4,1fr); }
  .week-grid .day-card:nth-child(n+8) { display:none; }
}
`;