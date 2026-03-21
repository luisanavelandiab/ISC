/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useEffect, useState, useMemo } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, doc,
  Timestamp, query, orderBy,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import Link from "next/link";

const ONESIGNAL_APP_ID = "4ac9b789-b178-48fd-b700-82478cc9c68e";

interface Unit  { id: string; name: string; }
interface Guard { id: string; name: string; role?: string; }

interface ProgramadaVisita {
  id: string;
  supervisorId: string;
  supervisorName: string;
  unitId: string;
  unitName: string;
  semana: string;
  fechaProgramada: Timestamp;
  estado: "Pendiente" | "Completada" | "Justificada";
  visitaId?: string;
  justificacion?: string;
  creadoEn: Timestamp;
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getWeekBounds(isoWeek: string): { start: Date; end: Date; label: string } {
  const [year, weekNum] = isoWeek.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(Date.UTC(year, 0, 4 - dayOfWeek + 1 + (weekNum - 1) * 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return { start: monday, end: sunday, label: `${fmt(monday)} – ${fmt(sunday)}` };
}

function weeksAround(center: string, before = 2, after = 4): string[] {
  const [year, weekNum] = center.split("-W").map(Number);
  const weeks: string[] = [];
  for (let offset = -before; offset <= after; offset++) {
    let w = weekNum + offset; let y = year;
    if (w < 1) { y--; w += 52; } if (w > 52) { y++; w -= 52; }
    weeks.push(`${y}-W${String(w).padStart(2, "0")}`);
  }
  return weeks;
}

const MIN_VISITS_PER_WEEK = 2;

type DestinatarioTipo = "supervisor_asignado" | "todos_supervisores" | "manual";

export default function CalendarioVisitasPage() {
  const [units,       setUnits]       = useState<Unit[]>([]);
  const [guards,      setGuards]      = useState<Guard[]>([]);
  const [programadas, setProgramadas] = useState<ProgramadaVisita[]>([]);
  const [currentWeek]                 = useState(() => getISOWeek(new Date()));
  const [selectedWeek, setSelectedWeek] = useState(() => getISOWeek(new Date()));
  const [filterSupervisor, setFilterSupervisor] = useState("all");
  const [showNew,  setShowNew]  = useState(false);
  const [showJust, setShowJust] = useState<ProgramadaVisita | null>(null);
  const [justText, setJustText] = useState("");
  const [saving,   setSaving]   = useState(false);

  // Form nueva visita
  const [nSupervisor, setNSupervisor] = useState("");
  const [nUnit,       setNUnit]       = useState("");
  const [nSemana,     setNSemana]     = useState(() => getISOWeek(new Date()));
  const [nFecha,      setNFecha]      = useState("");

  // Notificación
  const [notifTipo,       setNotifTipo]       = useState<DestinatarioTipo>("supervisor_asignado");
  const [notifManuales,   setNotifManuales]   = useState<string[]>([]);
  const [notifTitulo,     setNotifTitulo]     = useState("🗓 Nueva visita asignada");
  const [notifMensaje,    setNotifMensaje]    = useState("");
  const [enviandoNotif,   setEnviandoNotif]   = useState(false);
  const [notifResultado,  setNotifResultado]  = useState<{ ok: boolean; msg: string } | null>(null);

  const weeks = useMemo(() => weeksAround(currentWeek, 2, 4), [currentWeek]);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "units"),
      s => setUnits(s.docs.map(d => ({ id: d.id, name: d.data().name }))));
    const u2 = onSnapshot(collection(db, "personnel"),
      s => setGuards(s.docs.map(d => ({
        id: d.id,
        name: d.data().fullName || d.data().name || "Sin nombre",
        role: d.data().role,
      }))));
    const u3 = onSnapshot(
      query(collection(db, "visitas_programadas"), orderBy("fechaProgramada", "desc")),
      s => setProgramadas(s.docs.map(d => ({ id: d.id, ...d.data() } as ProgramadaVisita)))
    );
    return () => { u1(); u2(); u3(); };
  }, []);

  // Auto-rellenar mensaje cuando cambia supervisor o unidad
  useEffect(() => {
    const sup  = guards.find(g => g.id === nSupervisor);
    const unit = units.find(u => u.id === nUnit);
    if (sup && unit && nFecha) {
      const fecha = new Date(nFecha).toLocaleDateString("es-ES", {
        weekday: "long", day: "numeric", month: "long",
      });
      setNotifMensaje(`Tienes una visita programada a ${unit.name} el ${fecha}.`);
    }
  }, [nSupervisor, nUnit, nFecha, guards, units]);

  const visibleWeeks = useMemo(() => weeks.map(w => {
    const bounds = getWeekBounds(w);
    const visitsThisWeek = programadas.filter(v => v.semana === w);
    const bySupervisor: Record<string, ProgramadaVisita[]> = {};
    visitsThisWeek.forEach(v => {
      if (!bySupervisor[v.supervisorId]) bySupervisor[v.supervisorId] = [];
      bySupervisor[v.supervisorId].push(v);
    });
    return { week: w, bounds, visits: visitsThisWeek, bySupervisor };
  }), [weeks, programadas]);

  const selectedWeekData = useMemo(() => {
    const data = visibleWeeks.find(w => w.week === selectedWeek);
    if (!data) return null;
    let visits = data.visits;
    if (filterSupervisor !== "all") visits = visits.filter(v => v.supervisorId === filterSupervisor);
    return { ...data, visits };
  }, [visibleWeeks, selectedWeek, filterSupervisor]);

  const alertSupervisors = useMemo(() => {
    const curData = visibleWeeks.find(w => w.week === currentWeek);
    if (!curData) return [];
    return Object.entries(curData.bySupervisor)
      .filter(([, visits]) => visits.filter(v => v.estado === "Completada").length < MIN_VISITS_PER_WEEK)
      .map(([supId]) => {
        const g = guards.find(g => g.id === supId);
        const vis = curData.bySupervisor[supId];
        return { id: supId, name: g?.name || supId, completed: vis.filter(v => v.estado === "Completada").length, total: vis.length };
      });
  }, [visibleWeeks, currentWeek, guards]);

  const supervisores = guards; // mostrar todos

  // ── Enviar notificación vía API route ──
  async function enviarNotificacion(supervisorId?: string) {
    setEnviandoNotif(true);
    setNotifResultado(null);
    try {
      let destinatarios: string | string[];

      if (notifTipo === "todos_supervisores") {
        destinatarios = "todos";
      } else if (notifTipo === "supervisor_asignado" && supervisorId) {
        destinatarios = [supervisorId];
      } else if (notifTipo === "manual") {
        if (notifManuales.length === 0) {
          setNotifResultado({ ok: false, msg: "Selecciona al menos un destinatario." });
          setEnviandoNotif(false);
          return;
        }
        destinatarios = notifManuales;
      } else {
        setNotifResultado({ ok: false, msg: "Configura los destinatarios." });
        setEnviandoNotif(false);
        return;
      }

      const res = await fetch("/api/send-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: notifTitulo,
          mensaje: notifMensaje,
          destinatarios,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setNotifResultado({ ok: true, msg: `✓ Notificación enviada a ${data.recipients ?? "destinatarios"} dispositivo(s).` });
      } else {
        setNotifResultado({ ok: false, msg: data.error || "Error al enviar." });
      }
    } catch {
      setNotifResultado({ ok: false, msg: "Error de conexión." });
    } finally {
      setEnviandoNotif(false);
    }
  }

  async function saveProgramada() {
    if (!nSupervisor || !nUnit || !nFecha) { alert("Completa todos los campos"); return; }
    setSaving(true);
    try {
      const sup  = guards.find(g => g.id === nSupervisor);
      const unit = units.find(u => u.id === nUnit);
      await addDoc(collection(db, "visitas_programadas"), {
        supervisorId: nSupervisor, supervisorName: sup?.name ?? "",
        unitId: nUnit, unitName: unit?.name ?? "",
        semana: nSemana,
        fechaProgramada: Timestamp.fromDate(new Date(nFecha)),
        estado: "Pendiente", creadoEn: Timestamp.now(),
      });

      // Enviar notificación si hay mensaje
      if (notifMensaje.trim()) {
        await enviarNotificacion(nSupervisor);
      }

      if (!notifResultado || notifResultado.ok) {
        setShowNew(false);
        setNSupervisor(""); setNUnit(""); setNFecha("");
        setNotifMensaje(""); setNotifManuales([]);
        setNotifResultado(null);
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function marcarCompletada(pv: ProgramadaVisita) {
    await updateDoc(doc(db, "visitas_programadas", pv.id), { estado: "Completada" });
  }

  async function saveJustificacion() {
    if (!showJust || !justText.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "visitas_programadas", showJust.id), {
        estado: "Justificada", justificacion: justText.trim(),
      });
      setShowJust(null); setJustText("");
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  function toggleManual(id: string) {
    setNotifManuales(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function estadoBadge(estado: string) {
    if (estado === "Completada")  return "bdg-ok";
    if (estado === "Justificada") return "bdg-just";
    return "bdg-pend";
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="cal-wrap">
        <div className="corner corner-tl"/><div className="corner corner-tr"/>
        <div className="corner corner-bl"/><div className="corner corner-br"/>

        <div className="cal-inner">
          <div className="cal-header">
            <div>
              <div className="ornament"><div className="orn-line"/><div className="orn-diamond"/><div className="orn-line right"/></div>
              <p className="eyebrow">Control de supervisión</p>
              <h1 className="page-title">Calendario <span>de Visitas</span></h1>
            </div>
            <div className="hdr-actions">
              <button className="btn-pri" onClick={() => setShowNew(true)}>+ Programar visita</button>
            </div>
          </div>

          {alertSupervisors.length > 0 && (
            <div className="alert-bar">
              <span className="alert-icon">⚠</span>
              <div className="alert-content">
                <strong>Semana actual — sin cuota mínima ({MIN_VISITS_PER_WEEK} visitas):</strong>
                <div className="alert-chips">
                  {alertSupervisors.map(s => (
                    <span key={s.id} className="alert-chip">{s.name} — {s.completed}/{s.total}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="week-scroll">
            {visibleWeeks.map(({ week, bounds }) => {
              const isNow  = week === currentWeek;
              const total  = visibleWeeks.find(w => w.week === week)?.visits.length ?? 0;
              const done   = visibleWeeks.find(w => w.week === week)?.visits.filter(v => v.estado === "Completada").length ?? 0;
              return (
                <button key={week} className={`week-tab${selectedWeek===week?" active":""}${isNow?" current":""}`} onClick={()=>setSelectedWeek(week)}>
                  {isNow && <span className="now-dot"/>}
                  <span className="wt-week">{week.replace("-W"," · sem ")}</span>
                  <span className="wt-dates">{bounds.label}</span>
                  {total > 0 && <span className={`wt-count${done===total?" all-done":done>0?" partial":""}`}>{done}/{total}</span>}
                </button>
              );
            })}
          </div>

          {selectedWeekData && (
            <div className="week-detail">
              <div className="week-detail-hdr">
                <div>
                  <p className="eyebrow" style={{marginBottom:2}}>{selectedWeek.replace("-W"," · semana ")}</p>
                  <p className="week-range">{selectedWeekData.bounds.label}</p>
                </div>
                <select className="fsel" value={filterSupervisor} onChange={e=>setFilterSupervisor(e.target.value)}>
                  <option value="all">Todos los supervisores</option>
                  {supervisores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {filterSupervisor === "all" && (
                <div className="supervisor-progress">
                  {Object.entries(selectedWeekData.bySupervisor).map(([supId, vis]) => {
                    const completed = vis.filter(v=>v.estado==="Completada").length;
                    const pct = Math.min(100,(completed/MIN_VISITS_PER_WEEK)*100);
                    const supName = guards.find(g=>g.id===supId)?.name ?? supId;
                    const ok = completed >= MIN_VISITS_PER_WEEK;
                    return (
                      <div key={supId} className="sup-progress-row">
                        <span className="sup-name">{supName}</span>
                        <div className="prog-bar-wrap">
                          <div className="prog-bar"><div className={`prog-fill ${ok?"ok":"warn"}`} style={{width:`${pct}%`}}/></div>
                          <span className={`prog-label ${ok?"ok":"warn"}`}>{completed}/{MIN_VISITS_PER_WEEK} {ok?"✓":""}</span>
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(selectedWeekData.bySupervisor).length === 0 && <p className="no-prog">No hay visitas programadas.</p>}
                </div>
              )}

              {selectedWeekData.visits.length === 0 ? (
                <div className="empty-week">
                  <p>Sin visitas programadas.</p>
                  <button className="btn-sec" onClick={()=>setShowNew(true)} style={{marginTop:12}}>+ Programar visita</button>
                </div>
              ) : (
                <div className="visits-list">
                  {selectedWeekData.visits.map(v => (
                    <div key={v.id} className={`visit-card ${v.estado==="Completada"?"done":v.estado==="Justificada"?"justified":""}`}>
                      <div className="vc-top">
                        <div className="vc-info">
                          <span className="vc-unit">🏢 {v.unitName}</span>
                          <span className="vc-sup">👤 {v.supervisorName}</span>
                          <span className="vc-date">📅 {v.fechaProgramada.toDate().toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"})}</span>
                        </div>
                        <span className={`bdg ${estadoBadge(v.estado)}`}>{v.estado}</span>
                      </div>
                      {v.justificacion && <div className="vc-just">💬 {v.justificacion}</div>}
                      {v.estado === "Pendiente" && (
                        <div className="vc-actions">
                          <button className="btn-complete" onClick={()=>marcarCompletada(v)}>✓ Marcar completada</button>
                          <button className="btn-just-open" onClick={()=>{setShowJust(v);setJustText("");}}>Justificar ausencia</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── MODAL: Nueva visita + Notificación ── */}
        {showNew && (
          <div className="overlay" onClick={e=>{if(e.target===e.currentTarget){setShowNew(false);setNotifResultado(null);}}}>
            <div className="sheet" onClick={e=>e.stopPropagation()}>
              <div className="sheet-hdr">
                <div><p className="eyebrow" style={{marginBottom:4}}>Programar</p><h3 className="modal-ttl">Nueva visita</h3></div>
                <button className="close-btn" onClick={()=>{setShowNew(false);setNotifResultado(null);}}>✕</button>
              </div>
              <div className="sheet-body">

                {/* ── Visita ── */}
                <p className="slbl">📋 Datos de la visita</p>
                <div className="fld">
                  <label className="flbl">Supervisor *</label>
                  <select className="fsel" value={nSupervisor} onChange={e=>setNSupervisor(e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {supervisores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="fld">
                  <label className="flbl">Unidad a visitar *</label>
                  <select className="fsel" value={nUnit} onChange={e=>setNUnit(e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="g2">
                  <div className="fld">
                    <label className="flbl">Semana</label>
                    <select className="fsel" value={nSemana} onChange={e=>setNSemana(e.target.value)}>
                      {weeks.map(w=>{const b=getWeekBounds(w);return<option key={w} value={w}>{w.replace("-W"," · sem ")} — {b.label}</option>;})}
                    </select>
                  </div>
                  <div className="fld">
                    <label className="flbl">Fecha y hora *</label>
                    <input className="finp" type="datetime-local" value={nFecha} onChange={e=>setNFecha(e.target.value)}/>
                  </div>
                </div>

                {/* ── Notificación ── */}
                <div className="notif-section">
                  <p className="slbl">🔔 Notificación push</p>

                  <div className="fld">
                    <label className="flbl">Enviar a</label>
                    <div className="destinatario-grid">
                      {([
                        ["supervisor_asignado", "👤", "Solo el supervisor asignado"],
                        ["todos_supervisores",  "👥", "Todos los supervisores"],
                        ["manual",             "✎",  "Elegir manualmente"],
                      ] as const).map(([tipo, icon, label]) => (
                        <button key={tipo}
                          className={`dest-btn${notifTipo===tipo?" dest-active":""}`}
                          onClick={()=>setNotifTipo(tipo)} type="button">
                          <span className="dest-icon">{icon}</span>
                          <span className="dest-label">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Selector manual */}
                  {notifTipo === "manual" && (
                    <div className="fld">
                      <label className="flbl">Seleccionar destinatarios</label>
                      <div className="manual-list">
                        {supervisores.map(s => (
                          <label key={s.id} className={`manual-item${notifManuales.includes(s.id)?" manual-checked":""}`}>
                            <input type="checkbox" checked={notifManuales.includes(s.id)} onChange={()=>toggleManual(s.id)}/>
                            <span className="manual-name">{s.name}</span>
                            {s.role && <span className="manual-role">{s.role}</span>}
                          </label>
                        ))}
                      </div>
                      {notifManuales.length > 0 && (
                        <p className="manual-count">{notifManuales.length} seleccionado(s)</p>
                      )}
                    </div>
                  )}

                  <div className="fld">
                    <label className="flbl">Título de la notificación</label>
                    <input className="finp" value={notifTitulo} onChange={e=>setNotifTitulo(e.target.value)} placeholder="🗓 Nueva visita asignada"/>
                  </div>

                  <div className="fld">
                    <label className="flbl">Mensaje</label>
                    <textarea className="ftxt" rows={3} value={notifMensaje} onChange={e=>setNotifMensaje(e.target.value)}
                      placeholder="El mensaje se genera automáticamente al seleccionar supervisor, unidad y fecha…"/>
                  </div>

                  {notifResultado && (
                    <div className={`notif-result ${notifResultado.ok?"notif-ok":"notif-err"}`}>
                      {notifResultado.msg}
                    </div>
                  )}
                </div>
              </div>

              <div className="sheet-ftr">
                <button className="btn-pri" onClick={saveProgramada}
                  disabled={saving || enviandoNotif || !nSupervisor || !nUnit || !nFecha}>
                  {saving || enviandoNotif ? "Guardando…" : "Programar y notificar"}
                </button>
                <button className="btn-sec" onClick={()=>{setShowNew(false);setNotifResultado(null);}}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: Justificación ── */}
        {showJust && (
          <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setShowJust(null);}}>
            <div className="confirm-box" onClick={e=>e.stopPropagation()}>
              <div className="orn-diamond" style={{margin:"0 auto 14px"}}/>
              <h3 className="modal-ttl" style={{textAlign:"center",marginBottom:8}}>Justificar ausencia</h3>
              <p className="conf-desc">Visita: <strong>{showJust.unitName}</strong><br/>Supervisor: <strong>{showJust.supervisorName}</strong></p>
              <div className="fld" style={{width:"100%",marginTop:12}}>
                <label className="flbl">Motivo *</label>
                <textarea className="ftxt" rows={3} value={justText} onChange={e=>setJustText(e.target.value)} placeholder="Describe el motivo…"/>
              </div>
              <div className="conf-acts">
                <button className="btn-pri" onClick={saveJustificacion} disabled={saving||!justText.trim()}>
                  {saving?"Guardando…":"Guardar justificación"}
                </button>
                <button className="btn-sec" onClick={()=>setShowJust(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Montserrat:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--gold:#C9A84C;--gold-light:#E8C97A;--gold-dark:#8B6914;--black:#0A0A0A;--black-mid:#111111;--black-card:#161616;--white:#F5F0E8;--white-dim:rgba(245,240,232,0.6);--border:rgba(201,168,76,0.18);--danger:#E57373;--success:#81C784;--warn:#FFB74D;--purple:#B39DDB;}
body{background:var(--black);font-family:'Montserrat',sans-serif}
.cal-wrap{min-height:100vh;background:var(--black);position:relative;overflow-x:hidden;padding:40px 20px 60px}
.cal-wrap::before{content:'';position:fixed;inset:0;background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);background-size:60px 60px;pointer-events:none;z-index:0}
.cal-wrap::after{content:'';position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:700px;height:700px;background:radial-gradient(ellipse,rgba(201,168,76,.07) 0%,transparent 70%);pointer-events:none;z-index:0}
.cal-inner{position:relative;z-index:1}
.corner{position:fixed;width:40px;height:40px;z-index:5;opacity:.4}
.corner-tl{top:20px;left:20px;border-top:1px solid var(--gold);border-left:1px solid var(--gold)}
.corner-tr{top:20px;right:20px;border-top:1px solid var(--gold);border-right:1px solid var(--gold)}
.corner-bl{bottom:20px;left:20px;border-bottom:1px solid var(--gold);border-left:1px solid var(--gold)}
.corner-br{bottom:20px;right:20px;border-bottom:1px solid var(--gold);border-right:1px solid var(--gold)}
.ornament{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.orn-line{height:1px;width:60px;background:linear-gradient(90deg,transparent,var(--gold))}
.orn-line.right{background:linear-gradient(90deg,var(--gold),transparent)}
.orn-diamond{width:8px;height:8px;background:var(--gold);transform:rotate(45deg);box-shadow:0 0 12px rgba(201,168,76,.6);flex-shrink:0}
@keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
.cal-header{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-bottom:24px;animation:fadeUp .9s ease .1s both}
.eyebrow{font-size:10px;font-weight:600;letter-spacing:6px;text-transform:uppercase;color:var(--gold)}
.page-title{font-family:'Cormorant Garamond',serif;font-size:clamp(28px,6vw,56px);font-weight:300;line-height:1.05;color:var(--white)}
.page-title span{color:var(--gold);font-style:italic;font-weight:600}
.hdr-actions{display:flex;gap:8px}
.btn-pri{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px 24px;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--black);background:linear-gradient(135deg,var(--gold-light),var(--gold),var(--gold-dark));clip-path:polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%);border:none;cursor:pointer;transition:all .3s ease;white-space:nowrap}
.btn-pri:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 28px rgba(201,168,76,.5)}
.btn-pri:disabled{opacity:.4;cursor:not-allowed}
.btn-sec{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px 20px;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--white-dim);background:transparent;border:1px solid var(--border);clip-path:polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%);cursor:pointer;transition:all .3s ease;white-space:nowrap}
.btn-sec:hover{border-color:var(--gold);color:var(--white)}
.alert-bar{display:flex;gap:12px;background:rgba(229,115,115,.07);border:1px solid rgba(229,115,115,.25);padding:14px 16px;margin-bottom:24px;animation:fadeUp .9s ease .15s both}
.alert-icon{font-size:16px;flex-shrink:0;margin-top:1px}
.alert-content{flex:1}
.alert-content strong{font-size:11px;font-weight:600;color:var(--danger);letter-spacing:.5px;display:block;margin-bottom:8px}
.alert-chips{display:flex;flex-wrap:wrap;gap:6px}
.alert-chip{font-size:10px;font-weight:600;padding:3px 10px;background:rgba(229,115,115,.1);border:1px solid rgba(229,115,115,.25);color:var(--danger)}
.week-scroll{display:flex;gap:4px;overflow-x:auto;padding-bottom:2px;margin-bottom:24px;animation:fadeUp .9s ease .2s both;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.week-scroll::-webkit-scrollbar{display:none}
.week-tab{flex-shrink:0;display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:12px 14px;background:var(--black-card);border:1px solid var(--border);cursor:pointer;transition:all .25s;position:relative;min-width:150px}
.week-tab.active{border-color:var(--gold);background:rgba(201,168,76,.05)}
.week-tab.current::after{content:'HOY';position:absolute;top:6px;right:8px;font-size:7px;font-weight:700;letter-spacing:1.5px;color:var(--gold);opacity:.7}
.now-dot{width:6px;height:6px;background:var(--gold);border-radius:50%;position:absolute;top:8px;left:8px;box-shadow:0 0 8px rgba(201,168,76,.6)}
.wt-week{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold)}
.wt-dates{font-size:10px;color:var(--white-dim)}
.wt-count{font-size:9px;font-weight:700;padding:2px 8px;border:1px solid;letter-spacing:.5px}
.wt-count.all-done{background:rgba(129,199,132,.1);color:var(--success);border-color:rgba(129,199,132,.3)}
.wt-count.partial{background:rgba(255,183,77,.08);color:var(--warn);border-color:rgba(255,183,77,.25)}
.wt-count:not(.all-done):not(.partial){background:rgba(201,168,76,.06);color:var(--gold);border-color:rgba(201,168,76,.2)}
.week-detail{animation:fadeUp .5s ease both}
.week-detail-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.week-range{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;color:var(--white)}
.supervisor-progress{background:var(--black-card);border:1px solid var(--border);padding:16px;margin-bottom:20px;display:flex;flex-direction:column;gap:10px}
.sup-progress-row{display:flex;align-items:center;gap:12px}
.sup-name{font-size:11px;font-weight:600;color:var(--white-dim);min-width:130px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prog-bar-wrap{flex:1;display:flex;align-items:center;gap:10px}
.prog-bar{flex:1;height:4px;background:rgba(255,255,255,.07);overflow:hidden}
.prog-fill{height:100%;transition:width .5s ease;border-radius:2px}
.prog-fill.ok{background:var(--success)}.prog-fill.warn{background:var(--warn)}
.prog-label{font-size:9px;font-weight:700;min-width:40px;text-align:right}
.prog-label.ok{color:var(--success)}.prog-label.warn{color:var(--warn)}
.no-prog{font-size:11px;color:var(--white-dim);font-style:italic;text-align:center;padding:8px 0}
.visits-list{display:flex;flex-direction:column;gap:8px}
.visit-card{background:var(--black-card);border:1px solid var(--border);padding:14px 16px;transition:border-color .25s;position:relative}
.visit-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--warn)}
.visit-card.done::before{background:var(--success)}.visit-card.justified::before{background:var(--purple)}
.vc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px}
.vc-info{display:flex;flex-direction:column;gap:3px}
.vc-unit{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:400;color:var(--white)}
.vc-sup,.vc-date{font-size:10px;color:var(--white-dim)}
.vc-just{font-size:11px;color:var(--purple);padding:8px 10px;background:rgba(179,157,219,.06);border:1px solid rgba(179,157,219,.15);margin-bottom:8px;line-height:1.5}
.vc-actions{display:flex;gap:8px;flex-wrap:wrap}
.btn-complete{padding:8px 16px;background:rgba(129,199,132,.08);border:1px solid rgba(129,199,132,.3);color:var(--success);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;transition:all .2s;clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)}
.btn-complete:hover{background:rgba(129,199,132,.15)}
.btn-just-open{padding:8px 16px;background:transparent;border:1px solid rgba(255,255,255,.1);color:var(--white-dim);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:500;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s;clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)}
.btn-just-open:hover{border-color:var(--purple);color:var(--purple)}
.empty-week{padding:48px 20px;text-align:center;color:var(--white-dim);font-size:12px}
.bdg{font-size:9px;font-weight:600;padding:3px 10px;letter-spacing:.5px;border:1px solid;display:inline-block;flex-shrink:0}
.bdg-ok   {background:rgba(129,199,132,.08);color:var(--success);border-color:rgba(129,199,132,.3)}
.bdg-pend {background:rgba(255,183,77,.08);color:var(--warn);border-color:rgba(255,183,77,.25)}
.bdg-just {background:rgba(179,157,219,.08);color:var(--purple);border-color:rgba(179,157,219,.3)}

/* ── Sección notificación ── */
.notif-section{background:rgba(201,168,76,.03);border:1px solid rgba(201,168,76,.1);padding:16px;display:flex;flex-direction:column;gap:14px}
.destinatario-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.dest-btn{display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);color:var(--white-dim);cursor:pointer;transition:all .2s;text-align:center}
.dest-btn:hover{border-color:rgba(201,168,76,.3);color:var(--white)}
.dest-active{border-color:var(--gold)!important;color:var(--gold)!important;background:rgba(201,168,76,.08)!important}
.dest-icon{font-size:18px}
.dest-label{font-size:9px;font-weight:600;letter-spacing:.5px;line-height:1.3}
.manual-list{display:flex;flex-direction:column;gap:5px;max-height:180px;overflow-y:auto;background:rgba(0,0,0,.2);border:1px solid var(--border);padding:8px}
.manual-item{display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;transition:background .15s;border:1px solid transparent}
.manual-item:hover{background:rgba(201,168,76,.04);border-color:rgba(201,168,76,.1)}
.manual-checked{background:rgba(201,168,76,.06)!important;border-color:rgba(201,168,76,.2)!important}
.manual-item input[type="checkbox"]{accent-color:var(--gold);width:14px;height:14px;flex-shrink:0;cursor:pointer}
.manual-name{flex:1;font-size:11px;color:var(--white);font-weight:500}
.manual-role{font-size:9px;color:var(--gold);background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.2);padding:2px 7px;text-transform:uppercase;letter-spacing:.5px}
.manual-count{font-size:10px;color:var(--gold);font-weight:600;padding-top:4px}
.notif-result{font-size:11px;padding:10px 12px;border:1px solid;line-height:1.5}
.notif-ok{background:rgba(129,199,132,.07);border-color:rgba(129,199,132,.3);color:var(--success)}
.notif-err{background:rgba(229,115,115,.07);border-color:rgba(229,115,115,.3);color:var(--danger)}

/* Form */
.fld{display:flex;flex-direction:column;gap:6px}
.flbl{font-size:8px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--gold);opacity:.8}
.fsel,.finp,.ftxt{background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--white);padding:12px 13px;font-family:'Montserrat',sans-serif;font-size:14px;outline:none;width:100%;transition:border-color .2s;-webkit-appearance:none}
.fsel:focus,.finp:focus,.ftxt:focus{border-color:var(--gold)}
.fsel option{background:#1a1a1a;color:var(--white)}
.ftxt{resize:vertical;min-height:80px;line-height:1.5}
.g2{display:grid;grid-template-columns:1fr;gap:10px}
.slbl{font-size:9px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:var(--gold);padding-bottom:10px;border-bottom:1px solid rgba(201,168,76,.1)}

/* Modal */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(12px);display:flex;justify-content:center;align-items:flex-end;z-index:10000}
.sheet{background:var(--black-mid);border:1px solid rgba(201,168,76,.25);border-bottom:none;width:100%;max-width:560px;max-height:92vh;display:flex;flex-direction:column;border-radius:16px 16px 0 0;box-shadow:0 -24px 80px rgba(0,0,0,.9);animation:slideUp .3s ease both;overflow:hidden}
@keyframes slideUp{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
.sheet-hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 22px 14px;border-bottom:1px solid rgba(201,168,76,.1);flex-shrink:0}
.modal-ttl{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:300;color:var(--white)}
.close-btn{background:none;border:1px solid rgba(255,255,255,.1);color:var(--white-dim);width:30px;height:30px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0}
.close-btn:hover{border-color:var(--danger);color:var(--danger)}
.sheet-body{flex:1;overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:16px}
.sheet-ftr{padding:14px 22px;border-top:1px solid rgba(201,168,76,.1);display:flex;gap:8px;flex-shrink:0;background:var(--black-mid)}
.sheet-ftr .btn-pri,.sheet-ftr .btn-sec{flex:1}
.confirm-box{background:var(--black-mid);border:1px solid rgba(201,168,76,.2);padding:28px 22px;width:calc(100% - 32px);max-width:420px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.8);border-radius:4px;margin:auto}
.conf-desc{font-size:12px;color:var(--white-dim);line-height:1.7}
.conf-desc strong{color:var(--white)}
.conf-acts{display:flex;gap:8px;width:100%}
.conf-acts .btn-pri,.conf-acts .btn-sec{flex:1}

@media(min-width:600px){.g2{grid-template-columns:1fr 1fr}.destinatario-grid{grid-template-columns:repeat(3,1fr)}}
@media(min-width:768px){.cal-wrap{padding:48px 40px 60px}.overlay{align-items:center}.sheet{border-radius:4px;border-bottom:1px solid rgba(201,168,76,.25);animation:none;max-height:85vh}}
@media(min-width:1024px){.cal-wrap{padding:60px 60px 80px}}
`;