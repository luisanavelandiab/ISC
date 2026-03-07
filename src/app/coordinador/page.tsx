/* eslint-disable react-hooks/exhaustive-deps */
 
"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  collection, onSnapshot, query, where, orderBy, doc, getDoc,
} from "firebase/firestore";
import { auth, db } from "@/services/firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Unit {
  id: string; name: string; shiftType: string;
  requiredPositions: { shiftType: string; quantity: number }[];
}
interface Guard { id: string; name: string; available: boolean; state?: string; }
interface Assignment {
  id: string; unitId: string; unitName: string; guardId: string; guardName: string;
  date: Date; shift: "dia" | "noche" | "descanso"; status: "borrador" | "publicado";
}
interface AlertDoc {
  id: string; type: string; severity: "critica" | "advertencia" | "info";
  unitName?: string; guardName?: string; message: string; createdAt: Date;
}

function getMonday(d: Date) {
  const r = new Date(d); const day = r.getDay();
  r.setDate(r.getDate() - day + (day === 0 ? -6 : 1)); r.setHours(0,0,0,0); return r;
}
function getWeekDays(offset: number): Date[] {
  const base = getMonday(new Date()); base.setDate(base.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return d; });
}
function fmtRange(days: Date[]) {
  return days[0].toLocaleDateString("es-ES",{day:"2-digit",month:"short"}) + " — " + days[6].toLocaleDateString("es-ES",{day:"2-digit",month:"short"});
}
function dateKey(d: Date) { return d.toISOString().slice(0,10); }

const SEV_COLOR: Record<string,string> = { critica:"#E57373", advertencia:"#C9A84C", info:"#4DA3FF" };
const SEV_ICON:  Record<string,string> = { critica:"🔴", advertencia:"🟡", info:"🔵" };

export default function CoordinadorPage() {
  const router = useRouter();
  const [authorized,  setAuthorized]  = useState(false);
  const [units,       setUnits]       = useState<Unit[]>([]);
  const [guards,      setGuards]      = useState<Guard[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [alerts,      setAlerts]      = useState<AlertDoc[]>([]);
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [filterUnit,  setFilterUnit]  = useState("all");
  const [view,        setView]        = useState<"calendar"|"chart">("calendar");
  const [userName,    setUserName]    = useState("Coordinador");
  const [ddOpen,      setDdOpen]      = useState(false);

  // ── Verificación de rol con onAuthStateChanged ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) { await signOut(auth); router.replace("/login"); return; }
        const data = snap.data();
        const role = (data.role || data.authRole || "").toLowerCase();
        const name = data.displayName || user.email || "Coordinador";
        if (role === "coordinador") { setUserName(name); setAuthorized(true); }
        else if (role === "admin")     router.replace("/admin");
        else if (role === "vigilante") router.replace("/vigilante");
        else                           router.replace("/login");
      } catch (err) {
        console.error("Error verificando rol:", err);
        router.replace("/login");
      }
    });
    return () => unsub();
  }, []);

  // ── Firestore — solo si está autorizado ──
  useEffect(() => {
    if (!authorized) return;
    const u1 = onSnapshot(collection(db,"units"),(s) => setUnits(s.docs.map((d) => ({id:d.id,...d.data()} as Unit))));
    const u2 = onSnapshot(collection(db,"personnel"),(s) => setGuards(s.docs.map((d) => ({id:d.id,...d.data()} as Guard))));
    const u3 = onSnapshot(
      query(collection(db,"assignments"), where("status","in",["borrador","publicado"])),
      (s) => setAssignments(s.docs.map((d) => { const r=d.data(); return {id:d.id,...r,date:r.date?.toDate?.()||new Date()} as Assignment; }))
    );
    const u4 = onSnapshot(
      query(collection(db,"alerts"), where("resolved","==",false), orderBy("createdAt","desc")),
      (s) => setAlerts(s.docs.map((d) => { const r=d.data(); return {id:d.id,...r,createdAt:r.createdAt?.toDate?.()||new Date()} as AlertDoc; }))
    );
    return () => { u1(); u2(); u3(); u4(); };
  }, [authorized]);

  // ── Logout con limpieza de cookie ──
  async function handleLogout() {
    document.cookie = "isc-role=; path=/; max-age=0";
    await signOut(auth);
    router.push("/login");
  }

  const weekDays        = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const weekAssignments = useMemo(() => assignments.filter((a) => weekDays.some((d) => dateKey(d)===dateKey(a.date))), [assignments,weekDays]);

  const coverageMap = useMemo(() => {
    const map: Record<string,{required:number;assigned:number}> = {};
    units.forEach((u) => {
      const req  = u.requiredPositions?.reduce((s,p) => s+p.quantity,0)||0;
      const asgn = weekAssignments.filter((a) => a.unitId===u.id && a.shift!=="descanso").length;
      map[u.id] = { required:req*7, assigned:asgn };
    });
    return map;
  }, [units,weekAssignments]);

  const totalRequired = Object.values(coverageMap).reduce((s,v) => s+v.required,0);
  const totalAssigned = Object.values(coverageMap).reduce((s,v) => s+v.assigned,0);
  const coveragePct   = totalRequired>0 ? Math.round(totalAssigned/totalRequired*100) : 0;
  const chartData     = units.map((u) => ({ name:u.name.length>9?u.name.slice(0,9)+"…":u.name, Requerido:coverageMap[u.id]?.required||0, Asignado:coverageMap[u.id]?.assigned||0 }));
  const visibleUnits  = filterUnit==="all" ? units : units.filter((u) => u.id===filterUnit);
  const selLabel      = filterUnit==="all" ? "Todas" : (units.find((u) => u.id===filterUnit)?.name??"Todas");
  const criticalAlerts = alerts.filter((a) => a.severity==="critica");

  // ── Pantalla de carga ──
  if (!authorized) {
    return (
      <>
        <style>{`
          *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
          body{background:#0A0A0A}
          .auth-screen{min-height:100vh;background:#0A0A0A;display:flex;align-items:center;justify-content:center;font-family:'Montserrat',sans-serif;position:relative;overflow:hidden;}
          .auth-screen::before{content:'';position:fixed;inset:0;background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;}
          .auth-inner{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:16px;}
          .auth-spinner{width:36px;height:36px;border:2px solid rgba(201,168,76,.15);border-top-color:#C9A84C;border-radius:50%;animation:spin .8s linear infinite;}
          @keyframes spin{to{transform:rotate(360deg)}}
          .auth-label{font-size:9px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:rgba(201,168,76,.6);}
          .auth-brand{font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:300;color:rgba(245,240,232,.2);letter-spacing:2px;margin-bottom:8px;}
        `}</style>
        <div className="auth-screen">
          <div className="auth-inner">
            <p className="auth-brand">ISC Control</p>
            <div className="auth-spinner" />
            <p className="auth-label">Verificando acceso...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="cp">

        <div className="cp-header">
          <div>
            <p className="cp-eye">Vista coordinador</p>
            <h1 className="cp-title">Centro de Control <span>Operativo</span></h1>
          </div>
          <div className="cp-header-right">
            <nav className="cp-nav">
<Link href="/coordinador/alertas" className="cp-nav-btn">                🔔 <span className="nav-lbl">Alertas</span>
                {alerts.length>0 && <span className="nav-badge">{alerts.length}</span>}
              </Link>
              <Link href="/coordinador/historial" className="cp-nav-btn">📋 <span className="nav-lbl">Historial</span></Link>
              <Link href="/coordinador/personal"  className="cp-nav-btn">👥 <span className="nav-lbl">Personal</span></Link>
            </nav>
            <div className="cp-user">
              <span className="cp-user-name">{userName}</span>
              <span className="cp-user-role">Coordinador</span>
            </div>
            <button className="btn-logout" onClick={handleLogout} title="Cerrar sesión">⎋</button>
          </div>
        </div>

        <div className="readonly-banner">
          <span className="readonly-icon">👁</span>
          <span>Modo coordinador — el calendario es de solo lectura. Las asignaciones las gestiona el administrador.</span>
        </div>

        {criticalAlerts.length>0 && (
          <div className="critical-strip">
            <span className="critical-icon">🔴</span>
            <span className="critical-text">
              {criticalAlerts.length} alerta{criticalAlerts.length!==1?"s":""} crítica{criticalAlerts.length!==1?"s":""} activa{criticalAlerts.length!==1?"s":""}:
              {" "}{criticalAlerts[0].message}
            </span>
            <Link href="/alertas" className="critical-link">Ver alertas →</Link>
          </div>
        )}

        <div className="kpi-row">
          <div className="kpi"><div className="kpi-lbl">Unidades</div><div className="kpi-val">{units.length}</div></div>
          <div className="kpi"><div className="kpi-lbl">Agentes</div><div className="kpi-val">{guards.filter((g) => g.available||g.state==="Activo").length}</div></div>
          <div className="kpi">
            <div className="kpi-lbl">Cobertura</div>
            <div className="kpi-val" style={{color:coveragePct>=90?"#81C784":coveragePct>=60?"var(--gold)":"#E57373"}}>{coveragePct}%</div>
          </div>
          <div className="kpi">
            <div className="kpi-lbl">Alertas</div>
            <div className="kpi-val" style={{color:alerts.length>0?"#E57373":"#81C784"}}>{alerts.length}</div>
          </div>
        </div>

        <div className="tab-row">
          <button className={"tab-btn"+(view==="calendar"?" active":"")} onClick={() => setView("calendar")}>📅 Calendario</button>
          <button className={"tab-btn"+(view==="chart"?" active":"")}    onClick={() => setView("chart")}>📊 Cobertura</button>
        </div>

        {view==="chart" && (
          <div className="chart-panel">
            <p className="sec-lbl">Cobertura semanal por unidad</p>
            <div className="chart-card">
              <div style={{width:"100%",height:220,minWidth:0}}>
                <ResponsiveContainer>
                  <BarChart data={chartData} barCategoryGap="35%">
                    <XAxis dataKey="name" tick={{fill:"rgba(245,240,232,.45)",fontSize:9,fontFamily:"Montserrat"}} axisLine={{stroke:"rgba(201,168,76,.15)"}} tickLine={false}/>
                    <YAxis tick={{fill:"rgba(245,240,232,.45)",fontSize:9,fontFamily:"Montserrat"}} axisLine={false} tickLine={false} width={22}/>
                    <Tooltip contentStyle={{background:"#141414",border:"1px solid rgba(201,168,76,.25)",fontFamily:"Montserrat",fontSize:11,color:"#F5F0E8"}} cursor={{fill:"rgba(201,168,76,.04)"}}/>
                    <Bar dataKey="Requerido" fill="#E57373" radius={0}/>
                    <Bar dataKey="Asignado"  fill="#C9A84C" radius={0}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="sec-lbl" style={{marginTop:20}}>Alertas activas recientes</p>
            {alerts.length===0
              ? <div className="empty-alerts">✓ Sin alertas activas</div>
              : <div className="alerts-mini">
                  {alerts.slice(0,5).map((a) => (
                    <div key={a.id} className="alert-mini-row" style={{borderLeftColor:SEV_COLOR[a.severity]}}>
                      <span>{SEV_ICON[a.severity]}</span>
                      <span className="alert-mini-msg">{a.message}</span>
                      {a.unitName && <span className="alert-mini-unit">📍 {a.unitName}</span>}
                    </div>
                  ))}
                  {alerts.length>5 && <Link href="/alertas" className="alerts-more">Ver todas ({alerts.length}) →</Link>}
                </div>
            }
          </div>
        )}

        {view==="calendar" && (
          <div className="calendar-panel">
            <div className="week-bar">
              <button className="nav-btn" onClick={() => setWeekOffset((w) => w-1)}>◀</button>
              <span className="week-range">📅 {fmtRange(weekDays)}</span>
              <button className="nav-btn" onClick={() => setWeekOffset((w) => w+1)}>▶</button>
              <div className="dd-wrap">
                <button className="dd-btn" onClick={() => setDdOpen((o) => !o)}>
                  <span className="dd-txt">{selLabel}</span>
                  <span className={"dd-arrow"+(ddOpen?" open":"")}>▼</span>
                </button>
                {ddOpen && (
                  <div className="dd-menu">
                    <div className={"dd-item"+(filterUnit==="all"?" sel":"")} onClick={() => {setFilterUnit("all");setDdOpen(false);}}>Todas</div>
                    {units.map((u) => (
                      <div key={u.id} className={"dd-item"+(filterUnit===u.id?" sel":"")} onClick={() => {setFilterUnit(u.id);setDdOpen(false);}}>{u.name}</div>
                    ))}
                  </div>
                )}
              </div>
              <span className="readonly-tag">👁 Solo lectura</span>
            </div>

            <p className="tbl-hint">← desliza para ver la semana →</p>

            <div className="tbl-scroll">
              <div className="mgrid" style={{gridTemplateColumns:`150px repeat(7, minmax(100px,1fr))`}}>
                <div className="mhdr">Unidad</div>
                {weekDays.map((d) => (
                  <div key={d.toISOString()} className="mhdr">
                    {d.toLocaleDateString("es-ES",{weekday:"short",day:"2-digit"})}
                  </div>
                ))}
                {visibleUnits.map((unit) => (
                  <React.Fragment key={unit.id}>
                    <div className="munit">
                      <strong>{unit.name}</strong>
                      <span className="munit-sub">Tipo {unit.shiftType}</span>
                    </div>
                    {weekDays.map((day) => {
                      const cellAsgs   = weekAssignments.filter((a) => a.unitId===unit.id && dateKey(a.date)===dateKey(day));
                      const dayAsgs    = cellAsgs.filter((a) => a.shift==="dia");
                      const nightAsgs  = cellAsgs.filter((a) => a.shift==="noche");
                      const cellAlerts = alerts.filter((al) => al.unitName===unit.name);
                      return (
                        <div key={dateKey(day)} className={"mcell"+(cellAlerts.length>0?" mcell-alert":"")}>
                          {cellAlerts.length>0 && <div className="cell-alert-dot" title={cellAlerts[0].message}>⚠</div>}
                          <div className="shift-row">
                            <span className="shift-label shift-label-day">☀️ Día</span>
                            {dayAsgs.length===0
                              ? <span className="shift-empty">Sin cubrir</span>
                              : dayAsgs.map((a) => (
                                <div key={a.id} className="pill pill-day">
                                  <span>{a.guardName}</span>
                                  {a.status==="borrador" && <span className="pill-draft" title="Borrador">●</span>}
                                </div>
                              ))
                            }
                          </div>
                          <div className="shift-row shift-row-night">
                            <span className="shift-label shift-label-night">🌙 Noche</span>
                            {nightAsgs.length===0
                              ? <span className="shift-empty">Sin cubrir</span>
                              : nightAsgs.map((a) => (
                                <div key={a.id} className="pill pill-night">
                                  <span>{a.guardName}</span>
                                  {a.status==="borrador" && <span className="pill-draft" title="Borrador">●</span>}
                                </div>
                              ))
                            }
                          </div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="legend">
              <span className="legend-item"><span className="legend-dot" style={{background:"var(--gold)"}}/> Publicado</span>
              <span className="legend-item"><span className="legend-dot draft-dot"/> Borrador (pendiente)</span>
              <span className="legend-item"><span className="legend-dot" style={{background:"#E57373"}}/> Sin cubrir</span>
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
:root{--gold:#C9A84C;--gold-light:#E8C97A;--black:#0A0A0A;--card:#141414;--card2:#1c1c1c;--white:#F5F0E8;--dim:rgba(245,240,232,.5);--border:rgba(201,168,76,.18);--red:#E57373;--blue:#4DA3FF;--green:#81C784;}
.cp{background:var(--black);min-height:100vh;font-family:'Montserrat',sans-serif;color:var(--white);padding:20px 16px 60px}
.cp::before{content:'';position:fixed;inset:0;background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;z-index:0}
.cp>*{position:relative;z-index:1}
.cp-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.cp-eye{font-size:9px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:4px}
.cp-title{font-family:'Cormorant Garamond',serif;font-size:clamp(22px,6vw,36px);font-weight:300;line-height:1.1}
.cp-title span{color:var(--gold);font-style:italic;font-weight:600}
.cp-header-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cp-nav{display:flex;gap:5px}
.cp-nav-btn{display:flex;align-items:center;gap:5px;padding:7px 11px;background:var(--card);border:1px solid var(--border);color:var(--dim);text-decoration:none;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;position:relative;transition:color .2s,border-color .2s;white-space:nowrap;clip-path:polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)}
.cp-nav-btn:hover{color:var(--gold);border-color:var(--gold)}
.nav-lbl{display:none}
.nav-badge{position:absolute;top:-5px;right:-5px;background:var(--red);color:#fff;font-size:8px;font-weight:700;width:15px;height:15px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.cp-user{display:flex;flex-direction:column;align-items:flex-end;gap:1px}
.cp-user-name{font-size:11px;color:var(--white);font-weight:600}
.cp-user-role{font-size:8px;color:var(--gold);letter-spacing:1px;text-transform:uppercase}
.btn-logout{padding:7px 10px;background:transparent;border:1px solid rgba(229,115,115,.25);color:var(--red);font-size:13px;cursor:pointer;transition:background .2s}
.btn-logout:hover{background:rgba(229,115,115,.08)}
.readonly-banner{display:flex;align-items:center;gap:8px;padding:9px 14px;background:rgba(77,163,255,.06);border:1px solid rgba(77,163,255,.2);color:rgba(77,163,255,.9);font-size:10px;margin-bottom:14px}
.readonly-icon{font-size:13px;flex-shrink:0}
.readonly-tag{font-size:8px;font-weight:600;letter-spacing:1px;color:rgba(77,163,255,.7);background:rgba(77,163,255,.08);border:1px solid rgba(77,163,255,.2);padding:3px 8px;white-space:nowrap}
.critical-strip{display:flex;align-items:center;gap:8px;padding:9px 14px;background:rgba(229,115,115,.07);border:1px solid rgba(229,115,115,.25);margin-bottom:14px;flex-wrap:wrap}
.critical-icon{font-size:13px;flex-shrink:0}
.critical-text{font-size:10px;color:rgba(229,115,115,.9);flex:1}
.critical-link{font-size:9px;font-weight:700;color:var(--red);text-decoration:none;letter-spacing:.5px;white-space:nowrap}
.critical-link:hover{text-decoration:underline}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:20px}
.kpi{background:var(--card);border:1px solid var(--border);padding:clamp(8px,2vw,18px) clamp(6px,2vw,14px);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)}
.kpi-lbl{font-size:clamp(6px,1.5vw,9px);font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:4px}
.kpi-val{font-family:'Cormorant Garamond',serif;font-size:clamp(22px,5vw,40px);font-weight:300;line-height:1}
.tab-row{display:flex;gap:2px;margin-bottom:20px;border-bottom:1px solid var(--border)}
.tab-btn{flex:1;padding:10px 4px;background:none;border:none;color:var(--dim);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .2s}
.tab-btn.active{color:var(--gold);border-bottom-color:var(--gold)}
.chart-panel{display:flex;flex-direction:column;gap:0}
.sec-lbl{font-size:9px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
.chart-card{background:var(--card);border:1px solid var(--border);padding:16px 10px 8px;margin-bottom:0}
.empty-alerts{font-size:11px;color:var(--green);padding:14px;background:rgba(129,199,132,.06);border:1px solid rgba(129,199,132,.15)}
.alerts-mini{display:flex;flex-direction:column;gap:5px}
.alert-mini-row{display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--card);border-left:3px solid transparent;border-top:1px solid rgba(255,255,255,.04);border-right:1px solid rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.04);font-size:10px}
.alert-mini-msg{flex:1;color:var(--white)}
.alert-mini-unit{color:var(--dim);font-size:9px;white-space:nowrap}
.alerts-more{font-size:10px;color:var(--gold);text-decoration:none;padding:10px 12px;display:block;text-align:center;border:1px dashed rgba(201,168,76,.2);margin-top:4px;transition:background .15s}
.alerts-more:hover{background:rgba(201,168,76,.05)}
.week-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.week-range{font-size:10px;color:var(--dim);letter-spacing:.5px;flex:1}
.nav-btn{width:32px;height:32px;flex-shrink:0;background:var(--card);border:1px solid var(--border);color:var(--gold);cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;transition:background .2s}
.nav-btn:hover{background:rgba(201,168,76,.1)}
.dd-wrap{position:relative;min-width:110px;max-width:180px}
.dd-btn{width:100%;background:var(--card);border:1px solid var(--border);color:var(--white);padding:8px 11px;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:11px;display:flex;align-items:center;gap:6px;clip-path:polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)}
.dd-btn:hover{border-color:var(--gold)}
.dd-txt{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dd-arrow{color:var(--gold);font-size:8px;transition:transform .2s}
.dd-arrow.open{transform:rotate(180deg)}
.dd-menu{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--card2);border:1px solid rgba(201,168,76,.3);box-shadow:0 16px 48px rgba(0,0,0,.9);max-height:220px;overflow-y:auto;z-index:9999}
.dd-item{padding:9px 13px;cursor:pointer;font-size:11px;color:var(--dim);border-bottom:1px solid rgba(201,168,76,.05);transition:background .15s,color .15s}
.dd-item:hover{background:rgba(201,168,76,.08);color:var(--white)}
.dd-item.sel{color:var(--gold);background:rgba(201,168,76,.06);box-shadow:inset 2px 0 0 var(--gold)}
.tbl-hint{font-size:9px;letter-spacing:1px;color:var(--dim);text-align:right;margin-bottom:4px}
.tbl-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);background:var(--card)}
.mgrid{display:grid;min-width:720px}
.mhdr{background:rgba(201,168,76,.08);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;padding:10px 8px;color:var(--gold);white-space:nowrap}
.munit{border-bottom:1px solid rgba(201,168,76,.08);padding:10px 8px;font-size:11px;display:flex;flex-direction:column;gap:3px}
.munit-sub{font-size:9px;color:var(--dim)}
.mcell{border-left:1px solid rgba(201,168,76,.05);border-bottom:1px solid rgba(201,168,76,.05);padding:4px;min-height:90px;display:flex;flex-direction:column;gap:2px;position:relative}
.mcell-alert{border-left-color:rgba(229,115,115,.3);background:rgba(229,115,115,.03)}
.cell-alert-dot{position:absolute;top:3px;right:3px;font-size:9px;color:var(--red);opacity:.8}
.shift-row{display:flex;flex-direction:column;flex:1;padding:4px 5px;border-radius:2px;background:rgba(201,168,76,.04);gap:3px;min-height:38px}
.shift-row-night{background:rgba(30,144,255,.04)}
.shift-label{font-size:8px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.6}
.shift-label-day{color:var(--gold)}
.shift-label-night{color:var(--blue)}
.shift-empty{font-size:9px;color:rgba(229,115,115,.7);font-style:italic}
.pill{display:inline-flex;align-items:center;gap:3px;padding:3px 6px;font-size:9px;border-radius:2px;margin-bottom:2px}
.pill-day{background:rgba(201,168,76,.18);color:var(--gold)}
.pill-night{background:rgba(30,144,255,.18);color:var(--blue)}
.pill-draft{font-size:7px;color:var(--gold);opacity:.8;animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.8}50%{opacity:.3}}
.legend{display:flex;gap:16px;padding:12px 0 0;flex-wrap:wrap}
.legend-item{display:flex;align-items:center;gap:5px;font-size:9px;color:var(--dim);letter-spacing:.5px}
.legend-dot{width:10px;height:10px;border-radius:2px;flex-shrink:0}
.draft-dot{background:transparent;border:1px solid var(--gold)}
@media(min-width:768px){
  .cp{padding:36px 32px 48px}
  .nav-lbl{display:inline}
  .tbl-hint{display:none}
  .mgrid{min-width:900px}
}
`;