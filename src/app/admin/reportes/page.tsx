/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useMemo } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, doc,
  Timestamp, query, orderBy,
} from "firebase/firestore";
import { db } from "@/services/firebase";

type EstadoVisita    = "Bueno" | "Regular" | "Deficiente" | "Crítico";
type TipoObservacion = "Positiva" | "Negativa" | "Neutral";
type TipoNecesidad   = "Uniforme" | "Calzado" | "Equipamiento" | "Munición" | "Otro";
type PrioNecesidad   = "Alta" | "Media" | "Baja";
type EstadoNec       = "Pendiente" | "En proceso" | "Atendido";

interface Unit  { id: string; name: string; }
interface Guard { id: string; name: string; }
interface Visita {
  id: string; unitId: string; unitName: string;
  inspector: string; estado: EstadoVisita;
  observaciones: string; fotoUrl?: string; fecha: Timestamp;
  lat?: number; lng?: number; locationLabel?: string;
}
interface ObservacionVigilante {
  id: string; guardId: string; guardName: string;
  unitId: string; unitName: string;
  tipo: TipoObservacion; descripcion: string;
  inspector: string; fecha: Timestamp;
}
interface Necesidad {
  id: string; guardId: string; guardName: string;
  unitId?: string; unitName?: string;
  tipo: TipoNecesidad; descripcion: string; cantidad?: string;
  prioridad: PrioNecesidad; estado: EstadoNec;
  registradoPor: string; origenVisita?: boolean;
  fecha: Timestamp; fechaAtencion?: Timestamp;
}

const ESTADOS: EstadoVisita[]      = ["Bueno","Regular","Deficiente","Crítico"];
const TIPOS_OBS: TipoObservacion[] = ["Positiva","Negativa","Neutral"];
const TIPOS_NEC: TipoNecesidad[]   = ["Uniforme","Calzado","Equipamiento","Munición","Otro"];
const PRIOS: PrioNecesidad[]       = ["Alta","Media","Baja"];
const ESTADOS_NEC: EstadoNec[]     = ["Pendiente","En proceso","Atendido"];
const ESTADO_CLS: Record<string,string> = { Bueno:"badge-ok", Regular:"badge-warn", Deficiente:"badge-danger", Crítico:"badge-critical" };
const TIPO_CLS:   Record<string,string> = { Positiva:"badge-ok", Negativa:"badge-danger", Neutral:"badge-neutral" };
const PRIO_CLS:   Record<string,string> = { Alta:"badge-critical", Media:"badge-warn", Baja:"badge-ok" };
const ENEC_CLS:   Record<string,string> = { Pendiente:"badge-warn", "En proceso":"badge-neutral", Atendido:"badge-ok" };
const TIPO_NEC_ICON: Record<TipoNecesidad,string> = { Uniforme:"👕", Calzado:"👟", Equipamiento:"🦺", Munición:"🔫", Otro:"📦" };

function fmtDate(ts: Timestamp) {
  return ts.toDate().toLocaleString("es-ES",{ day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function ReportesPage() {
  const [units,   setUnits]   = useState<Unit[]>([]);
  const [guards,  setGuards]  = useState<Guard[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [obsVig,  setObsVig]  = useState<ObservacionVigilante[]>([]);
  const [necs,    setNecs]    = useState<Necesidad[]>([]);
  const [tab, setTab] = useState<"visitas"|"observaciones"|"necesidades">("visitas");

  // Filtros
  const [fUnit,  setFUnit]  = useState("all");
  const [fGuard, setFGuard] = useState("all");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [fNecEstado, setFNecEstado] = useState<EstadoNec|"all">("all");
  const [fNecPrio,   setFNecPrio]   = useState<PrioNecesidad|"all">("all");
  const [fNecTipo,   setFNecTipo]   = useState<TipoNecesidad|"all">("all");

  // Modal visita
  const [showVisita, setShowVisita] = useState(false);
  const [vUnit,      setVUnit]      = useState("");
  const [vInspector, setVInspector] = useState("");
  const [vEstado,    setVEstado]    = useState<EstadoVisita>("Bueno");
  const [vObs,       setVObs]       = useState("");
  const [vFoto,      setVFoto]      = useState<string|null>(null);
  const [vSaving,    setVSaving]    = useState(false);
  // GPS
  const [vLat,       setVLat]       = useState<number|null>(null);
  const [vLng,       setVLng]       = useState<number|null>(null);
  const [vLocLabel,  setVLocLabel]  = useState("");
  const [locLoading, setLocLoading] = useState(false);
  const [locError,   setLocError]   = useState("");

  // Modal obs
  const [showObs, setShowObs] = useState(false);
  const [oGuard,  setOGuard]  = useState("");
  const [oUnit,   setOUnit]   = useState("");
  const [oTipo,   setOTipo]   = useState<TipoObservacion>("Neutral");
  const [oDesc,   setODesc]   = useState("");
  const [oInsp,   setOInsp]   = useState("");
  const [oSaving, setOSaving] = useState(false);

  // Modal necesidad
  const [showNec,     setShowNec]     = useState(false);
  const [nGuard,      setNGuard]      = useState("");
  const [nUnit,       setNUnit]       = useState("");
  const [nTipo,       setNTipo]       = useState<TipoNecesidad>("Uniforme");
  const [nDesc,       setNDesc]       = useState("");
  const [nCantidad,   setNCantidad]   = useState("");
  const [nPrio,       setNPrio]       = useState<PrioNecesidad>("Media");
  const [nReg,        setNReg]        = useState("");
  const [nOrigen,     setNOrigen]     = useState(false);
  const [nSaving,     setNSaving]     = useState(false);
  const [expandedNec, setExpandedNec] = useState<string|null>(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db,"units"),     s => setUnits(s.docs.map(d=>({id:d.id,name:d.data().name}))));
    const u2 = onSnapshot(collection(db,"personnel"), s => setGuards(s.docs.map(d=>({id:d.id,name:d.data().fullName||d.data().name||"Sin nombre"}))));
    const u3 = onSnapshot(query(collection(db,"visitas"),orderBy("fecha","desc")), s => setVisitas(s.docs.map(d=>({id:d.id,...d.data()} as Visita))));
    const u4 = onSnapshot(query(collection(db,"observaciones_vigilantes"),orderBy("fecha","desc")), s => setObsVig(s.docs.map(d=>({id:d.id,...d.data()} as ObservacionVigilante))));
    const u5 = onSnapshot(query(collection(db,"necesidades"),orderBy("fecha","desc")), s => setNecs(s.docs.map(d=>({id:d.id,...d.data()} as Necesidad))));
    return () => { u1();u2();u3();u4();u5(); };
  }, []);

  // ── GPS ──
  function captureLocation() {
    if (!navigator.geolocation) { setLocError("Tu navegador no soporta geolocalización."); return; }
    setLocLoading(true); setLocError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setVLat(lat); setVLng(lng);
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers:{"Accept-Language":"es"} });
          const data = await res.json();
          setVLocLabel(data.display_name ? data.display_name.split(",").slice(0,3).join(", ") : `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } catch { setVLocLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`); }
        setLocLoading(false);
      },
      (err) => {
        setLocLoading(false);
        if (err.code===1) setLocError("Permiso de ubicación denegado. Actívalo en tu navegador.");
        else if (err.code===2) setLocError("No se pudo obtener la ubicación. Intenta de nuevo.");
        else setLocError("Error al obtener ubicación.");
      },
      { enableHighAccuracy:true, timeout:10000 }
    );
  }

  function clearLoc() { setVLat(null); setVLng(null); setVLocLabel(""); setLocError(""); }

  function resetVisita() {
    setVUnit(""); setVInspector(""); setVEstado("Bueno"); setVObs(""); setVFoto(null); clearLoc();
  }

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setVFoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function saveVisita() {
    if (!vUnit||!vInspector) { alert("Completa los campos obligatorios"); return; }
    setVSaving(true);
    try {
      const unit = units.find(u=>u.id===vUnit);
      await addDoc(collection(db,"visitas"),{
        unitId:vUnit, unitName:unit?.name??"",
        inspector:vInspector, estado:vEstado,
        observaciones:vObs, fotoUrl:vFoto??null,
        lat:vLat??null, lng:vLng??null, locationLabel:vLocLabel||null,
        fecha:Timestamp.now(),
      });
      setShowVisita(false); resetVisita();
    } catch(e){console.error(e);} finally{setVSaving(false);}
  }

  async function saveObsVigilante() {
    if (!oGuard||!oUnit||!oDesc||!oInsp) { alert("Completa los campos obligatorios"); return; }
    setOSaving(true);
    try {
      const guard=guards.find(g=>g.id===oGuard); const unit=units.find(u=>u.id===oUnit);
      await addDoc(collection(db,"observaciones_vigilantes"),{ guardId:oGuard, guardName:guard?.name??"", unitId:oUnit, unitName:unit?.name??"", tipo:oTipo, descripcion:oDesc, inspector:oInsp, fecha:Timestamp.now() });
      setShowObs(false); setOGuard(""); setOUnit(""); setOTipo("Neutral"); setODesc(""); setOInsp("");
    } catch(e){console.error(e);} finally{setOSaving(false);}
  }

  async function saveNecesidad() {
    if (!nGuard||!nDesc||!nReg) { alert("Completa los campos obligatorios"); return; }
    setNSaving(true);
    try {
      const guard=guards.find(g=>g.id===nGuard); const unit=units.find(u=>u.id===nUnit);
      await addDoc(collection(db,"necesidades"),{ guardId:nGuard, guardName:guard?.name??"", unitId:nUnit||null, unitName:unit?.name||null, tipo:nTipo, descripcion:nDesc, cantidad:nCantidad||null, prioridad:nPrio, estado:"Pendiente", registradoPor:nReg, origenVisita:nOrigen, fecha:Timestamp.now() });
      setShowNec(false); setNGuard(""); setNUnit(""); setNTipo("Uniforme"); setNDesc(""); setNCantidad(""); setNPrio("Media"); setNReg(""); setNOrigen(false);
    } catch(e){console.error(e);} finally{setNSaving(false);}
  }

  async function cambiarEstadoNec(id: string, nuevoEstado: EstadoNec) {
    const update: any = { estado:nuevoEstado };
    if (nuevoEstado==="Atendido") update.fechaAtencion=Timestamp.now();
    await updateDoc(doc(db,"necesidades",id), update);
    setExpandedNec(null);
  }

  const filteredVisitas = useMemo(()=>visitas.filter(v=>{
    if (fUnit!=="all"&&v.unitId!==fUnit) return false;
    if (fDesde&&v.fecha.toDate()<new Date(fDesde)) return false;
    if (fHasta&&v.fecha.toDate()>new Date(fHasta+"T23:59:59")) return false;
    return true;
  }),[visitas,fUnit,fDesde,fHasta]);

  const filteredObs = useMemo(()=>obsVig.filter(o=>{
    if (fUnit!=="all"&&o.unitId!==fUnit) return false;
    if (fGuard!=="all"&&o.guardId!==fGuard) return false;
    if (fDesde&&o.fecha.toDate()<new Date(fDesde)) return false;
    if (fHasta&&o.fecha.toDate()>new Date(fHasta+"T23:59:59")) return false;
    return true;
  }),[obsVig,fUnit,fGuard,fDesde,fHasta]);

  const filteredNecs = useMemo(()=>necs.filter(n=>{
    if (fGuard!=="all"&&n.guardId!==fGuard) return false;
    if (fNecEstado!=="all"&&n.estado!==fNecEstado) return false;
    if (fNecPrio!=="all"&&n.prioridad!==fNecPrio) return false;
    if (fNecTipo!=="all"&&n.tipo!==fNecTipo) return false;
    return true;
  }),[necs,fGuard,fNecEstado,fNecPrio,fNecTipo]);

  const statNec      = { total:filteredNecs.length, pendiente:filteredNecs.filter(n=>n.estado==="Pendiente").length, alta:filteredNecs.filter(n=>n.prioridad==="Alta"&&n.estado!=="Atendido").length, atendido:filteredNecs.filter(n=>n.estado==="Atendido").length };
  const statVisitas  = { total:filteredVisitas.length, bueno:filteredVisitas.filter(v=>v.estado==="Bueno").length, deficiente:filteredVisitas.filter(v=>v.estado==="Deficiente"||v.estado==="Crítico").length };
  const statObs      = { total:filteredObs.length, positiva:filteredObs.filter(o=>o.tipo==="Positiva").length, negativa:filteredObs.filter(o=>o.tipo==="Negativa").length };

  return (
    <>
      <style>{CSS}</style>
      <div className="rp">

        <div className="rp-header">
          <div>
            <p className="rp-eye">Módulo de reportes</p>
            <h1 className="rp-title">Reportes <span>Operativos</span></h1>
          </div>
          <div className="rp-header-btns">
            <button className="btn-pri" onClick={()=>setShowVisita(true)}>+ Nueva visita</button>
            <button className="btn-sec" onClick={()=>setShowObs(true)}>+ Obs. agente</button>
            <button className="btn-nec" onClick={()=>setShowNec(true)}>+ Necesidad</button>
          </div>
        </div>

        {tab==="necesidades" ? (
          <div className="stats-row stats-4">
            <div className="stat-card"><div className="stat-lbl">Total</div><div className="stat-val">{statNec.total}</div><div className="stat-sub">necesidades</div></div>
            <div className="stat-card stat-alert"><div className="stat-lbl">Pendientes</div><div className="stat-val">{statNec.pendiente}</div><div className="stat-sub">sin atender</div></div>
            <div className="stat-card stat-crit"><div className="stat-lbl">Prioridad alta</div><div className="stat-val">{statNec.alta}</div><div className="stat-sub">urgentes</div></div>
            <div className="stat-card stat-ok"><div className="stat-lbl">Atendidas</div><div className="stat-val">{statNec.atendido}</div><div className="stat-sub">completadas</div></div>
          </div>
        ) : (
          <div className="stats-row">
            <div className="stat-card"><div className="stat-lbl">Visitas</div><div className="stat-val">{statVisitas.total}</div><div className="stat-sub">{statVisitas.bueno} buenas · {statVisitas.deficiente} críticas</div></div>
            <div className="stat-card"><div className="stat-lbl">Observaciones</div><div className="stat-val">{statObs.total}</div><div className="stat-sub">{statObs.positiva} pos · {statObs.negativa} neg</div></div>
            <div className="stat-card stat-alert"><div className="stat-lbl">Necesidades</div><div className="stat-val">{necs.filter(n=>n.estado==="Pendiente").length}</div><div className="stat-sub">pendientes</div></div>
          </div>
        )}

        <div className="tab-row">
          <button className={"tab-btn"+(tab==="visitas"?" active":"")} onClick={()=>setTab("visitas")}>🏢 Visitas</button>
          <button className={"tab-btn"+(tab==="observaciones"?" active":"")} onClick={()=>setTab("observaciones")}>👮 Observaciones</button>
          <button className={"tab-btn"+(tab==="necesidades"?" active":"")+" tab-nec-btn"} onClick={()=>setTab("necesidades")}>
            📦 Necesidades
            {necs.filter(n=>n.estado==="Pendiente").length>0&&<span className="tab-badge">{necs.filter(n=>n.estado==="Pendiente").length}</span>}
          </button>
        </div>

        {/* ── VISITAS ── */}
        {tab==="visitas"&&(
          <>
            <div className="filters-row">
              <select className="filter-select" value={fUnit} onChange={e=>setFUnit(e.target.value)}>
                <option value="all">Todas las unidades</option>
                {units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <input className="filter-input" type="date" value={fDesde} onChange={e=>setFDesde(e.target.value)} title="Desde"/>
              <input className="filter-input" type="date" value={fHasta} onChange={e=>setFHasta(e.target.value)} title="Hasta"/>
              {(fUnit!=="all"||fDesde||fHasta)&&<button className="btn-clear" onClick={()=>{setFUnit("all");setFDesde("");setFHasta("");}}>✕ Limpiar</button>}
            </div>
            {filteredVisitas.length===0
              ? <div className="rp-empty">No hay visitas con los filtros aplicados.</div>
              : <div className="report-list">
                  {filteredVisitas.map(v=>(
                    <div key={v.id} className="report-card">
                      <div className="rc-head">
                        <div className="rc-title-row">
                          <span className="rc-unit">🏢 {v.unitName}</span>
                          <span className={"badge "+ESTADO_CLS[v.estado]}>{v.estado}</span>
                        </div>
                        <div className="rc-meta">
                          <span>👤 {v.inspector}</span>
                          <span>🕐 {fmtDate(v.fecha)}</span>
                          {v.lat&&v.lng&&(
                            <a href={mapsUrl(v.lat,v.lng)} target="_blank" rel="noopener noreferrer" className="loc-link-card">
                              📍 Ver en Maps
                            </a>
                          )}
                        </div>
                      </div>
                      {/* Mapa inline si tiene coordenadas */}
                      {v.lat&&v.lng&&(
                        <div className="map-card">
                          <div className="map-card-inner">
                            <iframe
                              title="ubicacion"
                              className="map-iframe-card"
                              src={`https://www.openstreetmap.org/export/embed.html?bbox=${v.lng-0.004},${v.lat-0.004},${v.lng+0.004},${v.lat+0.004}&layer=mapnik&marker=${v.lat},${v.lng}`}
                              scrolling="no"
                            />
                            <a href={mapsUrl(v.lat,v.lng)} target="_blank" rel="noopener noreferrer" className="map-card-overlay">
                              🗺 Abrir en Google Maps →
                            </a>
                          </div>
                          {v.locationLabel&&<div className="map-card-label">📍 {v.locationLabel}</div>}
                        </div>
                      )}
                      {v.observaciones&&<div className="rc-obs">{v.observaciones}</div>}
                      {v.fotoUrl&&(
                        <div className="rc-foto-wrap">
                          <img src={v.fotoUrl} alt="evidencia" className="rc-foto" onClick={()=>window.open(v.fotoUrl,"_blank")}/>
                          <span className="rc-foto-hint">Toca para ampliar</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
            }
          </>
        )}

        {/* ── OBSERVACIONES ── */}
        {tab==="observaciones"&&(
          <>
            <div className="filters-row">
              <select className="filter-select" value={fUnit} onChange={e=>setFUnit(e.target.value)}>
                <option value="all">Todas las unidades</option>
                {units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select className="filter-select" value={fGuard} onChange={e=>setFGuard(e.target.value)}>
                <option value="all">Todos los agentes</option>
                {guards.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input className="filter-input" type="date" value={fDesde} onChange={e=>setFDesde(e.target.value)} title="Desde"/>
              <input className="filter-input" type="date" value={fHasta} onChange={e=>setFHasta(e.target.value)} title="Hasta"/>
              {(fUnit!=="all"||fGuard!=="all"||fDesde||fHasta)&&<button className="btn-clear" onClick={()=>{setFUnit("all");setFGuard("all");setFDesde("");setFHasta("");}}>✕ Limpiar</button>}
            </div>
            {filteredObs.length===0
              ? <div className="rp-empty">No hay observaciones con los filtros aplicados.</div>
              : <div className="report-list">
                  {filteredObs.map(o=>(
                    <div key={o.id} className="report-card">
                      <div className="rc-head">
                        <div className="rc-title-row">
                          <span className="rc-unit">👮 {o.guardName}</span>
                          <span className={"badge "+TIPO_CLS[o.tipo]}>{o.tipo}</span>
                        </div>
                        <div className="rc-meta"><span>🏢 {o.unitName}</span><span>👤 {o.inspector}</span><span>🕐 {fmtDate(o.fecha)}</span></div>
                      </div>
                      <div className="rc-obs">{o.descripcion}</div>
                    </div>
                  ))}
                </div>
            }
          </>
        )}

        {/* ── NECESIDADES ── */}
        {tab==="necesidades"&&(
          <>
            <div className="filters-row">
              <select className="filter-select" value={fGuard} onChange={e=>setFGuard(e.target.value)}>
                <option value="all">Todos los agentes</option>
                {guards.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select className="filter-select" value={fNecTipo} onChange={e=>setFNecTipo(e.target.value as any)}>
                <option value="all">Todos los tipos</option>
                {TIPOS_NEC.map(t=><option key={t} value={t}>{TIPO_NEC_ICON[t]} {t}</option>)}
              </select>
              <select className="filter-select" value={fNecPrio} onChange={e=>setFNecPrio(e.target.value as any)}>
                <option value="all">Toda prioridad</option>
                {PRIOS.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select className="filter-select" value={fNecEstado} onChange={e=>setFNecEstado(e.target.value as any)}>
                <option value="all">Todos los estados</option>
                {ESTADOS_NEC.map(e=><option key={e} value={e}>{e}</option>)}
              </select>
              {(fGuard!=="all"||fNecTipo!=="all"||fNecPrio!=="all"||fNecEstado!=="all")&&
                <button className="btn-clear" onClick={()=>{setFGuard("all");setFNecTipo("all");setFNecPrio("all");setFNecEstado("all");}}>✕ Limpiar</button>}
            </div>
            {filteredNecs.length===0
              ? <div className="rp-empty">No hay necesidades registradas.<br/><br/><button className="btn-nec" onClick={()=>setShowNec(true)}>+ Registrar necesidad</button></div>
              : <div className="report-list">
                  {filteredNecs.map(n=>(
                    <div key={n.id} className={"report-card nec-card"+(n.prioridad==="Alta"&&n.estado!=="Atendido"?" nec-alta":"")+(n.estado==="Atendido"?" nec-done":"")}>
                      <div className="rc-head">
                        <div className="rc-title-row">
                          <span className="rc-unit"><span className="nec-tipo-icon">{TIPO_NEC_ICON[n.tipo]}</span>{n.guardName}{n.origenVisita&&<span className="nec-origen-badge">visita</span>}</span>
                          <div className="nec-badges"><span className={"badge "+PRIO_CLS[n.prioridad]}>{n.prioridad}</span><span className={"badge "+ENEC_CLS[n.estado]}>{n.estado}</span></div>
                        </div>
                        <div className="rc-meta">
                          <span>📦 {n.tipo}</span>
                          {n.unitName&&<span>🏢 {n.unitName}</span>}
                          {n.cantidad&&<span>🔢 {n.cantidad}</span>}
                          <span>👤 {n.registradoPor}</span>
                          <span>🕐 {fmtDate(n.fecha)}</span>
                          {n.fechaAtencion&&<span className="nec-atendido-date">✅ {fmtDate(n.fechaAtencion)}</span>}
                        </div>
                      </div>
                      <div className="rc-obs">{n.descripcion}</div>
                      {n.estado!=="Atendido"&&(
                        <div className="nec-actions">
                          {expandedNec===n.id ? (
                            <div className="nec-estado-row">
                              <span className="nec-estado-lbl">Cambiar a:</span>
                              {ESTADOS_NEC.filter(e=>e!==n.estado).map(e=>(
                                <button key={e} className={"btn-estado-nec badge "+ENEC_CLS[e]} onClick={()=>cambiarEstadoNec(n.id,e)}>{e}</button>
                              ))}
                              <button className="btn-cancel-nec" onClick={()=>setExpandedNec(null)}>✕</button>
                            </div>
                          ):(
                            <button className="btn-cambiar-estado" onClick={()=>setExpandedNec(n.id)}>Cambiar estado ↓</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
            }
          </>
        )}

        {/* ══ MODAL NUEVA VISITA ══ */}
        {showVisita&&(
          <div className="modal-overlay" onClick={()=>{setShowVisita(false);resetVisita();}}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="modal-handle"/>
              <h3 className="modal-title">Nueva visita a unidad</h3>

              <div className="form-field">
                <label className="form-lbl">Unidad *</label>
                <select className="form-select" value={vUnit} onChange={e=>setVUnit(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div className="form-field">
                <label className="form-lbl">Inspector / Responsable *</label>
                <input className="form-input" placeholder="Nombre del inspector" value={vInspector} onChange={e=>setVInspector(e.target.value)}/>
              </div>

              <div className="form-field">
                <label className="form-lbl">Estado encontrado</label>
                <div className="estado-grid">
                  {ESTADOS.map(e=>(
                    <button key={e} className={"estado-btn "+ESTADO_CLS[e]+(vEstado===e?" selected":"")} onClick={()=>setVEstado(e)}>{e}</button>
                  ))}
                </div>
              </div>

              {/* ── UBICACIÓN GPS ── */}
              <div className="form-field">
                <label className="form-lbl">Ubicación GPS</label>
                {vLat&&vLng ? (
                  <div className="loc-box">
                    <div className="loc-map-wrap">
                      <iframe
                        title="mapa"
                        className="loc-map-iframe"
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${vLng-0.003},${vLat-0.003},${vLng+0.003},${vLat+0.003}&layer=mapnik&marker=${vLat},${vLng}`}
                        scrolling="no"
                      />
                      <a href={mapsUrl(vLat,vLng)} target="_blank" rel="noopener noreferrer" className="loc-maps-btn">
                        🗺 Abrir en Google Maps
                      </a>
                    </div>
                    {vLocLabel&&<div className="loc-addr">📍 {vLocLabel}</div>}
                    <div className="loc-row-bottom">
                      <span className="loc-coords-txt">Lat {vLat.toFixed(6)} · Lng {vLng.toFixed(6)}</span>
                      <button className="loc-remove-btn" onClick={clearLoc}>✕ Quitar</button>
                    </div>
                  </div>
                ) : (
                  <div className="loc-empty-box">
                    <button className={"loc-capture-btn"+(locLoading?" loading":"")} onClick={captureLocation} disabled={locLoading}>
                      {locLoading
                        ? <><span className="loc-spin"/>Obteniendo ubicación…</>
                        : <>📍 Capturar ubicación actual</>
                      }
                    </button>
                    <p className="loc-hint-txt">Usa el GPS del dispositivo para registrar dónde estás ahora.</p>
                    {locError&&<div className="loc-err-txt">⚠ {locError}</div>}
                  </div>
                )}
              </div>

              <div className="form-field">
                <label className="form-lbl">Foto / Evidencia</label>
                <label className="foto-upload">
                  {vFoto?<img src={vFoto} alt="preview" className="foto-preview"/>:<span className="foto-placeholder">📷 Toca para subir imagen</span>}
                  <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFoto}/>
                </label>
                {vFoto&&<button className="btn-clear" style={{alignSelf:"flex-start"}} onClick={()=>setVFoto(null)}>✕ Quitar foto</button>}
              </div>

              <div className="form-field">
                <label className="form-lbl">Observaciones</label>
                <textarea className="form-textarea" placeholder="Describe lo encontrado en la visita…" rows={3} value={vObs} onChange={e=>setVObs(e.target.value)}/>
              </div>

              <div className="modal-actions">
                <button className="btn-pri" onClick={saveVisita} disabled={vSaving}>{vSaving?"Guardando…":"Guardar visita"}</button>
                <button className="btn-sec" onClick={()=>{setShowVisita(false);resetVisita();}}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ MODAL OBS VIGILANTE ══ */}
        {showObs&&(
          <div className="modal-overlay" onClick={()=>setShowObs(false)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="modal-handle"/>
              <h3 className="modal-title">Observación a agente</h3>
              <div className="form-row-2">
                <div className="form-field"><label className="form-lbl">Agente *</label><select className="form-select" value={oGuard} onChange={e=>setOGuard(e.target.value)}><option value="">— Seleccionar —</option>{guards.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
                <div className="form-field"><label className="form-lbl">Unidad *</label><select className="form-select" value={oUnit} onChange={e=>setOUnit(e.target.value)}><option value="">— Seleccionar —</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
              </div>
              <div className="form-field"><label className="form-lbl">Tipo de observación</label><div className="estado-grid">{TIPOS_OBS.map(t=><button key={t} className={"estado-btn "+TIPO_CLS[t]+(oTipo===t?" selected":"")} onClick={()=>setOTipo(t)}>{t}</button>)}</div></div>
              <div className="form-field"><label className="form-lbl">Descripción *</label><textarea className="form-textarea" placeholder="Describe la observación…" rows={3} value={oDesc} onChange={e=>setODesc(e.target.value)}/></div>
              <div className="form-field"><label className="form-lbl">Inspector que registra *</label><input className="form-input" placeholder="Nombre del inspector" value={oInsp} onChange={e=>setOInsp(e.target.value)}/></div>
              <div className="modal-actions">
                <button className="btn-pri" onClick={saveObsVigilante} disabled={oSaving}>{oSaving?"Guardando…":"Guardar observación"}</button>
                <button className="btn-sec" onClick={()=>setShowObs(false)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ MODAL NUEVA NECESIDAD ══ */}
        {showNec&&(
          <div className="modal-overlay" onClick={()=>setShowNec(false)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="modal-handle"/>
              <h3 className="modal-title">Registrar necesidad</h3>
              <div className="form-field"><label className="form-lbl">Origen del reporte</label><div className="origen-row"><button className={"origen-btn"+(nOrigen?" origen-active":"")} onClick={()=>setNOrigen(true)}>🏢 Visita a instalación</button><button className={"origen-btn"+(!nOrigen?" origen-active":"")} onClick={()=>setNOrigen(false)}>📞 Llamada / Solicitud personal</button></div></div>
              <div className="form-row-2">
                <div className="form-field"><label className="form-lbl">Agente *</label><select className="form-select" value={nGuard} onChange={e=>setNGuard(e.target.value)}><option value="">— Seleccionar —</option>{guards.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
                <div className="form-field"><label className="form-lbl">Unidad (opcional)</label><select className="form-select" value={nUnit} onChange={e=>setNUnit(e.target.value)}><option value="">— Ninguna —</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
              </div>
              <div className="form-field"><label className="form-lbl">Tipo de necesidad</label><div className="tipo-nec-grid">{TIPOS_NEC.map(t=><button key={t} className={"tipo-nec-btn"+(nTipo===t?" tipo-active":"")} onClick={()=>setNTipo(t)}><span className="tipo-icon">{TIPO_NEC_ICON[t]}</span><span>{t}</span></button>)}</div></div>
              <div className="form-row-2">
                <div className="form-field"><label className="form-lbl">Cantidad / Detalle</label><input className="form-input" placeholder="Ej: 1 par, talla 42" value={nCantidad} onChange={e=>setNCantidad(e.target.value)}/></div>
                <div className="form-field"><label className="form-lbl">Prioridad</label><div className="prio-row">{PRIOS.map(p=><button key={p} className={"prio-btn badge "+PRIO_CLS[p]+(nPrio===p?" selected":"")} onClick={()=>setNPrio(p)}>{p}</button>)}</div></div>
              </div>
              <div className="form-field"><label className="form-lbl">Descripción *</label><textarea className="form-textarea" placeholder="Describe la necesidad con detalle…" rows={3} value={nDesc} onChange={e=>setNDesc(e.target.value)}/></div>
              <div className="form-field"><label className="form-lbl">Registrado por *</label><input className="form-input" placeholder="Nombre de quien registra" value={nReg} onChange={e=>setNReg(e.target.value)}/></div>
              <div className="modal-actions">
                <button className="btn-pri" onClick={saveNecesidad} disabled={nSaving}>{nSaving?"Guardando…":"Guardar necesidad"}</button>
                <button className="btn-sec" onClick={()=>setShowNec(false)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Montserrat:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--gold:#C9A84C;--gold-light:#E8C97A;--black:#0A0A0A;--card:#141414;--card2:#1c1c1c;--white:#F5F0E8;--dim:rgba(245,240,232,.5);--border:rgba(201,168,76,.18);--danger:#E57373;--success:#81C784;--warn:#FFB74D;}
.rp{background:var(--black);min-height:100vh;font-family:'Montserrat',sans-serif;color:var(--white);padding:28px 20px 60px}
.rp::before{content:'';position:fixed;inset:0;background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;z-index:0}
.rp>*{position:relative;z-index:1}
.rp-eye{font-size:9px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:4px}
.rp-title{font-family:'Cormorant Garamond',serif;font-size:clamp(22px,5vw,34px);font-weight:300;line-height:1.1}
.rp-title span{color:var(--gold);font-style:italic;font-weight:600}
.rp-header{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:24px}
.rp-header-btns{display:flex;gap:8px;flex-wrap:wrap}
.btn-pri{background:var(--gold);color:var(--black);border:none;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;padding:10px 18px;cursor:pointer;transition:opacity .2s;white-space:nowrap}
.btn-pri:hover{opacity:.85}.btn-pri:disabled{opacity:.35;cursor:not-allowed}
.btn-sec{background:var(--card);color:var(--dim);border:1px solid var(--border);font-family:'Montserrat',sans-serif;font-size:11px;padding:10px 16px;cursor:pointer;transition:border-color .2s,color .2s;white-space:nowrap}
.btn-sec:hover{border-color:var(--gold);color:var(--white)}
.btn-nec{background:rgba(196,160,255,.12);color:#C4A0FF;border:1px solid rgba(196,160,255,.3);font-family:'Montserrat',sans-serif;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;padding:10px 18px;cursor:pointer;transition:all .2s;white-space:nowrap}
.btn-nec:hover{background:rgba(196,160,255,.2)}
.btn-clear{background:none;border:1px solid rgba(229,115,115,.3);color:var(--danger);font-family:'Montserrat',sans-serif;font-size:10px;padding:8px 12px;cursor:pointer;transition:all .2s;white-space:nowrap}
.btn-clear:hover{background:rgba(229,115,115,.08)}
.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:24px}
.stats-4{grid-template-columns:repeat(4,1fr)}
.stat-card{background:var(--card);border:1px solid var(--border);padding:16px 18px;clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)}
.stat-alert{border-color:rgba(255,183,77,.3)}.stat-crit{border-color:rgba(229,115,115,.3)}.stat-ok{border-color:rgba(129,199,132,.3)}
.stat-lbl{font-size:9px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:6px}
.stat-val{font-family:'Cormorant Garamond',serif;font-size:36px;font-weight:300;color:var(--white);line-height:1;margin-bottom:4px}
.stat-sub{font-size:10px;color:var(--dim)}
.tab-row{display:flex;gap:2px;margin-bottom:16px;border-bottom:1px solid var(--border)}
.tab-btn{flex:1;padding:11px 8px;background:none;border:none;color:var(--dim);font-family:'Montserrat',sans-serif;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .2s;position:relative}
.tab-btn.active{color:var(--gold);border-bottom-color:var(--gold)}
.tab-nec-btn.active{color:#C4A0FF;border-bottom-color:#C4A0FF}
.tab-badge{position:absolute;top:6px;right:6px;background:#E57373;color:#fff;font-size:8px;font-weight:700;padding:1px 5px;border-radius:8px;min-width:16px;text-align:center}
.filters-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}
.filter-select,.filter-input{background:var(--card);border:1px solid var(--border);color:var(--white);padding:9px 12px;font-family:'Montserrat',sans-serif;font-size:11px;outline:none;cursor:pointer;transition:border-color .2s}
.filter-select:focus,.filter-input:focus{border-color:var(--gold)}
.filter-select option{background:#fff;color:#000}
.filter-input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.4)}
.report-list{display:flex;flex-direction:column;gap:8px}
.report-card{background:var(--card);border:1px solid var(--border);padding:14px 16px;transition:border-color .2s}
.report-card:hover{border-color:rgba(201,168,76,.35)}
/* Mapa en tarjeta */
.map-card{margin:8px 0;border:1px solid var(--border);overflow:hidden}
.map-card-inner{position:relative}
.map-iframe-card{width:100%;height:130px;border:none;display:block;filter:invert(.85) hue-rotate(180deg) saturate(.6) brightness(.9)}
.map-card-overlay{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.65);color:var(--gold);font-size:10px;font-weight:600;text-align:center;padding:6px;text-decoration:none;letter-spacing:.5px;transition:background .2s}
.map-card-overlay:hover{background:rgba(0,0,0,.85)}
.map-card-label{font-size:9px;color:var(--dim);padding:6px 8px;background:rgba(0,0,0,.3);border-top:1px solid rgba(201,168,76,.1)}
.loc-link-card{font-size:10px;color:var(--gold);text-decoration:none;font-weight:600}
.loc-link-card:hover{text-decoration:underline}
/* Necesidades */
.nec-card{border-left:3px solid var(--border)}.nec-alta{border-left-color:#E57373!important;background:rgba(229,115,115,.04)}.nec-done{opacity:.6;border-left-color:rgba(129,199,132,.4)!important}
.rc-head{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
.rc-title-row{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.rc-unit{font-size:13px;font-weight:600;color:var(--white);display:flex;align-items:center;gap:6px}
.rc-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:10px;color:var(--dim);align-items:center}
.rc-obs{font-size:12px;color:var(--dim);line-height:1.6;border-top:1px solid rgba(255,255,255,.04);padding-top:8px}
.nec-badges{display:flex;gap:4px;align-items:center}
.nec-tipo-icon{font-size:16px}.nec-origen-badge{font-size:8px;font-weight:700;padding:2px 6px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.3);color:var(--gold)}.nec-atendido-date{color:var(--success)}
.nec-actions{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.04)}
.nec-estado-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.nec-estado-lbl{font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--dim)}
.btn-estado-nec{padding:5px 12px;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:9px;font-weight:700;letter-spacing:.5px;transition:all .15s}
.btn-cancel-nec{background:none;border:none;color:var(--dim);cursor:pointer;font-size:13px;padding:4px 8px}
.btn-cambiar-estado{background:none;border:1px solid rgba(255,255,255,.1);color:var(--dim);font-family:'Montserrat',sans-serif;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;padding:6px 12px;cursor:pointer;transition:all .15s}
.btn-cambiar-estado:hover{border-color:var(--gold);color:var(--gold)}
.badge{font-size:9px;font-weight:600;padding:3px 9px;letter-spacing:.5px;border:1px solid;display:inline-block;flex-shrink:0}
.badge-ok{background:rgba(129,199,132,.1);color:var(--success);border-color:rgba(129,199,132,.3)}
.badge-warn{background:rgba(255,183,77,.1);color:var(--warn);border-color:rgba(255,183,77,.3)}
.badge-danger{background:rgba(229,115,115,.1);color:var(--danger);border-color:rgba(229,115,115,.3)}
.badge-critical{background:rgba(229,50,50,.15);color:#FF5252;border-color:rgba(229,50,50,.4)}
.badge-neutral{background:rgba(150,150,200,.1);color:#9FA8DA;border-color:rgba(150,150,200,.3)}
.foto-upload{display:flex;align-items:center;justify-content:center;border:1px dashed rgba(201,168,76,.3);min-height:90px;cursor:pointer;transition:border-color .2s;overflow:hidden}
.foto-upload:hover{border-color:var(--gold)}
.foto-placeholder{font-size:12px;color:var(--dim)}
.foto-preview{width:100%;max-height:180px;object-fit:cover;display:block}
.rc-foto-wrap{margin-top:8px;border-top:1px solid rgba(255,255,255,.04);padding-top:8px;display:flex;flex-direction:column;gap:4px}
.rc-foto{width:100%;max-height:160px;object-fit:cover;cursor:pointer;border:1px solid var(--border);transition:opacity .2s}
.rc-foto:hover{opacity:.85}
.rc-foto-hint{font-size:9px;color:var(--dim)}
.rp-empty{padding:48px 20px;text-align:center;color:var(--dim);font-size:13px;display:flex;flex-direction:column;align-items:center;gap:16px}
/* ── GPS en modal ── */
.loc-empty-box{display:flex;flex-direction:column;gap:8px}
.loc-capture-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 16px;background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.35);color:var(--gold);font-family:'Montserrat',sans-serif;font-size:11px;font-weight:600;letter-spacing:.5px;cursor:pointer;transition:all .2s;width:100%}
.loc-capture-btn:hover:not(:disabled){background:rgba(201,168,76,.15);border-color:var(--gold)}
.loc-capture-btn:disabled{opacity:.5;cursor:not-allowed}
.loc-capture-btn.loading{border-color:rgba(201,168,76,.2);color:var(--dim)}
.loc-spin{width:12px;height:12px;border:2px solid rgba(201,168,76,.3);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;display:inline-block;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.loc-hint-txt{font-size:10px;color:var(--dim);line-height:1.5}
.loc-err-txt{font-size:10px;color:var(--danger);padding:8px 10px;background:rgba(229,115,115,.08);border:1px solid rgba(229,115,115,.2)}
.loc-box{display:flex;flex-direction:column;gap:8px}
.loc-map-wrap{position:relative;border:1px solid var(--border);overflow:hidden}
.loc-map-iframe{width:100%;height:190px;border:none;display:block;filter:invert(.85) hue-rotate(180deg) saturate(.6) brightness(.9)}
.loc-maps-btn{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.7);color:var(--gold);font-size:10px;font-weight:600;text-align:center;padding:8px;text-decoration:none;letter-spacing:.5px;transition:background .2s}
.loc-maps-btn:hover{background:rgba(0,0,0,.9)}
.loc-addr{font-size:10px;color:var(--white);padding:7px 10px;background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.12);line-height:1.4}
.loc-row-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px}
.loc-coords-txt{font-size:9px;color:var(--dim);font-family:monospace}
.loc-remove-btn{background:none;border:1px solid rgba(229,115,115,.3);color:var(--danger);font-family:'Montserrat',sans-serif;font-size:9px;font-weight:600;padding:4px 10px;cursor:pointer;transition:all .15s}
.loc-remove-btn:hover{background:rgba(229,115,115,.08)}
/* Modal */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);display:flex;justify-content:center;align-items:flex-end;z-index:10000}
.modal{background:#161625;border:1px solid var(--border);border-bottom:none;padding:24px 20px 32px;width:100%;max-width:520px;display:flex;flex-direction:column;gap:14px;border-radius:16px 16px 0 0;box-shadow:0 -20px 60px rgba(0,0,0,.8);animation:slideUp .25s ease both;max-height:90vh;overflow-y:auto}
@keyframes slideUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
.modal-handle{width:36px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;margin:0 auto -4px;flex-shrink:0}
.modal-title{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;color:var(--white)}
.form-field{display:flex;flex-direction:column;gap:6px}
.form-row-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.form-lbl{font-size:9px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--gold)}
.form-select,.form-input{background:var(--card);border:1px solid var(--border);color:var(--white);padding:11px 12px;font-family:'Montserrat',sans-serif;font-size:12px;outline:none;width:100%;transition:border-color .2s}
.form-select:focus,.form-input:focus{border-color:var(--gold)}
.form-input::placeholder{color:var(--dim)}
.form-select option{background:#fff;color:#000}
.form-textarea{width:100%;background:var(--card);border:1px solid var(--border);color:var(--white);padding:11px 12px;font-family:'Montserrat',sans-serif;font-size:12px;outline:none;resize:vertical;line-height:1.5;transition:border-color .2s}
.form-textarea:focus{border-color:var(--gold)}
.form-textarea::placeholder{color:var(--dim)}
.estado-grid{display:flex;gap:6px;flex-wrap:wrap}
.estado-btn{padding:7px 14px;background:none;border:1px solid var(--border);color:var(--dim);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:600;letter-spacing:.5px;cursor:pointer;transition:all .2s}
.estado-btn.badge-ok.selected{background:rgba(129,199,132,.15);border-color:var(--success);color:var(--success)}
.estado-btn.badge-warn.selected{background:rgba(255,183,77,.15);border-color:var(--warn);color:var(--warn)}
.estado-btn.badge-danger.selected{background:rgba(229,115,115,.15);border-color:var(--danger);color:var(--danger)}
.estado-btn.badge-critical.selected{background:rgba(229,50,50,.15);border-color:#FF5252;color:#FF5252}
.estado-btn.badge-neutral.selected{background:rgba(150,150,200,.12);border-color:#9FA8DA;color:#9FA8DA}
.estado-btn:hover{border-color:rgba(201,168,76,.4);color:var(--white)}
.origen-row{display:flex;gap:8px;flex-wrap:wrap}
.origen-btn{flex:1;padding:10px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);color:var(--dim);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:600;cursor:pointer;transition:all .2s;text-align:center}
.origen-btn:hover{border-color:var(--gold);color:var(--white)}
.origen-active{border-color:var(--gold)!important;color:var(--gold)!important;background:rgba(201,168,76,.08)!important}
.tipo-nec-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.tipo-nec-btn{padding:10px 6px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);color:var(--dim);font-family:'Montserrat',sans-serif;font-size:9px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}
.tipo-nec-btn:hover{border-color:rgba(201,168,76,.4);color:var(--white)}
.tipo-active{border-color:var(--gold)!important;color:var(--gold)!important;background:rgba(201,168,76,.08)!important}
.tipo-icon{font-size:20px}
.prio-row{display:flex;gap:6px;height:100%;align-items:flex-end}
.prio-btn{flex:1;padding:8px 6px;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:9px;font-weight:700;letter-spacing:.5px;transition:all .15s;text-align:center}
.modal-actions{display:flex;gap:8px}
.modal-actions .btn-pri,.modal-actions .btn-sec{flex:1;text-align:center;justify-content:center}
@media(min-width:768px){
  .modal-overlay{align-items:center}
  .modal{border-radius:4px;border-bottom:1px solid var(--border);animation:none}
  .modal-handle{display:none}
}
@media(max-width:600px){
  .rp{padding:16px 12px 48px}.rp-header{flex-direction:column}.rp-header-btns{width:100%}
  .btn-pri,.btn-sec,.btn-nec{flex:1;text-align:center}
  .stats-row,.stats-4{grid-template-columns:1fr 1fr}
  .form-row-2{grid-template-columns:1fr}
  .filters-row{flex-direction:column}
  .filter-select,.filter-input{width:100%}
  .tipo-nec-grid{grid-template-columns:repeat(3,1fr)}
}
`;