"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import Link from "next/link";
import { db } from "@/services/firebase";

interface RequiredPosition {
  shiftType: string; quantity: number;
  preferredShift?: "dia" | "noche"; requiredCategory?: string;
}
interface Unit {
  id: string; name: string; address: string; status: string;
  shiftType?: string; requiredPositions?: RequiredPosition[];
  restDay?: number; rotation?: boolean; minCoverage?: number; notes?: string;
}

const SHIFT_TYPES = ["A", "B", "C", "D", "E"] as const;
const SHIFT_LABELS: Record<string, string> = {
  A: "7×0 Permanente", B: "6×1 Individual", C: "6×1 Común",
  D: "4×2 Rotativo",   E: "1 Fijo + 2 Rotativos",
};
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function emptyForm(unit: Unit) {
  return {
    name: unit.name || "", address: unit.address || "",
    shiftType: unit.shiftType || "",
    restDay: unit.restDay !== undefined ? String(unit.restDay) : "",
    rotation: unit.rotation !== undefined ? unit.rotation : false,
    minCoverage: unit.minCoverage !== undefined ? String(unit.minCoverage) : "",
    notes: unit.notes || "",
    requiredPositions: (unit.requiredPositions || []).map(p => ({
      shiftType: p.shiftType || "dia", quantity: String(p.quantity || 1),
      preferredShift: p.preferredShift || "dia", requiredCategory: p.requiredCategory || "",
    })),
  };
}
type FormState = ReturnType<typeof emptyForm>;

export default function UnitsPage() {
  const [units,   setUnits]   = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [form,    setForm]    = useState<FormState | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saveOk,  setSaveOk]  = useState(false);

  useEffect(() => {
    const u = onSnapshot(collection(db, "units"), s => {
      setUnits(s.docs.map(d => ({ id: d.id, ...d.data() } as Unit)));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => u();
  }, []);

  function openEdit(unit: Unit) { setEditing(unit); setForm(emptyForm(unit)); setSaveOk(false); }
  function closeEdit() { setEditing(null); setForm(null); }
  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => f ? { ...f, [k]: v } : f);
  }
  function updatePos(i: number, k: keyof FormState["requiredPositions"][0], v: string) {
    setForm(f => { if (!f) return f; const p = [...f.requiredPositions]; p[i] = { ...p[i], [k]: v }; return { ...f, requiredPositions: p }; });
  }
  function addPos() { setForm(f => f ? { ...f, requiredPositions: [...f.requiredPositions, { shiftType: "dia", quantity: "1", preferredShift: "dia", requiredCategory: "" }] } : f); }
  function removePos(i: number) { setForm(f => { if (!f) return f; const p = [...f.requiredPositions]; p.splice(i, 1); return { ...f, requiredPositions: p }; }); }

  async function handleSave() {
    if (!editing || !form) return;
    setSaving(true);
    try {
      const data: Partial<Unit> = { name: form.name.trim(), address: form.address.trim() };
      if (form.shiftType) data.shiftType = form.shiftType;
      if (form.restDay !== "") data.restDay = Number(form.restDay);
      data.rotation = form.rotation;
      if (form.minCoverage !== "") data.minCoverage = Number(form.minCoverage);
      data.notes = form.notes.trim();
      data.requiredPositions = form.requiredPositions.map(p => ({
        shiftType: p.shiftType, quantity: Number(p.quantity) || 1,
        preferredShift: p.preferredShift as "dia" | "noche", requiredCategory: p.requiredCategory.trim(),
      }));
      await updateDoc(doc(db, "units", editing.id), data);
      setSaveOk(true); setTimeout(() => closeEdit(), 1200);
    } catch (e) { console.error(e); } finally { setSaving(false); }
  }

  async function handleDeactivate(id: string) {
    try { await updateDoc(doc(db, "units", id), { status: "Inactivo" }); }
    catch (e) { console.error(e); } finally { setConfirm(null); }
  }

  const active = units.filter(u => u.status === "Activo");

  if (loading) return (
    <div className="page-wrap"><div className="loading"><div className="spin" />Cargando unidades…</div></div>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="page-wrap">
        <div className="corner corner-tl"/><div className="corner corner-tr"/>
        <div className="corner corner-bl"/><div className="corner corner-br"/>
        <div className="page-inner">

          {/* Header */}
          <div className="page-header">
            <div>
              <div className="ornament"><div className="orn-line"/><div className="orn-diamond"/><div className="orn-line right"/></div>
              <p className="eyebrow">Gestión de unidades</p>
              <h1 className="page-title">Unidades <span>Activas</span></h1>
            </div>
            <div className="hdr-actions">
              <Link href="/admin/units/inactive">
                <button className="btn-sec">🚫 Desactivadas
                  {units.filter(u => u.status !== "Activo").length > 0 && <span className="badge-num">{units.filter(u => u.status !== "Activo").length}</span>}
                </button>
              </Link>
              <Link href="/admin/units/new"><button className="btn-pri">+ Nueva unidad</button></Link>
            </div>
          </div>

          {/* Tarjetas móvil */}
          <div className="cards-wrap">
            {active.length === 0 ? (
              <div className="empty"><p>No hay unidades activas.</p><Link href="/admin/units/new"><button className="btn-pri" style={{marginTop:16}}>Crear primera unidad</button></Link></div>
            ) : active.map(u => (
              <div key={u.id} className="unit-card">
                <div className="uc-top">
                  <div><span className="uc-name">{u.name}</span>{u.address && <span className="uc-addr">{u.address}</span>}</div>
                  <span className="bdg bdg-ok">● Activo</span>
                </div>
                <div className="uc-bdgs">
                  {u.shiftType && <span className="bdg bdg-shift">{u.shiftType} — {SHIFT_LABELS[u.shiftType]??u.shiftType}</span>}
                  {u.restDay !== undefined && <span className="bdg bdg-rest">{DAY_NAMES[u.restDay]}</span>}
                  {u.minCoverage !== undefined && <span className="bdg bdg-cov">{u.minCoverage}%</span>}
                  {u.rotation !== undefined && <span className={`bdg ${u.rotation?"bdg-rot-on":"bdg-rot-off"}`}>Rot: {u.rotation?"Sí":"No"}</span>}
                </div>
                {u.requiredPositions?.length ? <div className="uc-pos">{u.requiredPositions.map((p,i)=><span key={i} className="bdg bdg-pos">{p.preferredShift||p.shiftType}: {p.quantity}</span>)}</div> : null}
                <div className="uc-acts">
                  <button className="act-btn" onClick={()=>openEdit(u)}>✏️ Editar</button>
                  <button className="act-btn act-danger" onClick={()=>setConfirm(u.id)}>🚫 Desactivar</button>
                </div>
              </div>
            ))}
          </div>

          {/* Tabla desktop */}
          <div className="tbl-wrap">
            {active.length === 0 ? (
              <div className="empty"><p>No hay unidades activas.</p><Link href="/admin/units/new"><button className="btn-pri" style={{marginTop:16}}>Crear primera unidad</button></Link></div>
            ) : (
              <table className="dtable">
                <thead><tr><th>Unidad</th><th>Dirección</th><th>Turno</th><th>Posiciones</th><th>Descanso</th><th>Rotación</th><th>Cob.</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {active.map(u => (
                    <tr key={u.id}>
                      <td><span className="td-name">{u.name}</span></td>
                      <td className="td-dim">{u.address||<span className="td-nil">—</span>}</td>
                      <td>{u.shiftType?<span className="bdg bdg-shift">{u.shiftType} — {SHIFT_LABELS[u.shiftType]??u.shiftType}</span>:<span className="td-nil">—</span>}</td>
                      <td>{u.requiredPositions?.length?<div className="pos-list">{u.requiredPositions.map((p,i)=><span key={i} className="bdg bdg-pos">{p.preferredShift||p.shiftType}: {p.quantity}</span>)}</div>:<span className="td-nil">—</span>}</td>
                      <td>{u.restDay!==undefined?<span className="bdg bdg-rest">{DAY_NAMES[u.restDay]}</span>:<span className="td-nil">—</span>}</td>
                      <td>{u.rotation!==undefined?<span className={`bdg ${u.rotation?"bdg-rot-on":"bdg-rot-off"}`}>{u.rotation?"Sí":"No"}</span>:<span className="td-nil">—</span>}</td>
                      <td>{u.minCoverage!==undefined?<span className="bdg bdg-cov">{u.minCoverage}%</span>:<span className="td-nil">—</span>}</td>
                      <td><span className="bdg bdg-ok">● Activo</span></td>
                      <td><div className="row-acts"><button className="ico-btn" onClick={()=>openEdit(u)}>✏️</button><button className="ico-btn ico-danger" onClick={()=>setConfirm(u.id)}>🚫</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Modal edición */}
        {editing && form && (
          <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)closeEdit();}}>
            <div className="sheet" onClick={e=>e.stopPropagation()}>
              <div className="sheet-hdr">
                <div><p className="eyebrow" style={{marginBottom:4}}>Editando</p><h3 className="modal-ttl">{editing.name}</h3></div>
                <button className="close-btn" onClick={closeEdit}>✕</button>
              </div>
              <div className="sheet-body">
                <section className="fsec">
                  <p className="slbl">📋 Información básica</p>
                  <div className="g2">
                    <div className="fld"><label className="flbl">Nombre *</label><input className="finp" value={form.name} onChange={e=>setField("name",e.target.value)} placeholder="Nombre"/></div>
                    <div className="fld"><label className="flbl">Dirección</label><input className="finp" value={form.address} onChange={e=>setField("address",e.target.value)} placeholder="Dirección"/></div>
                  </div>
                </section>
                <section className="fsec">
                  <p className="slbl">⏰ Turno</p>
                  <div className="g3">
                    <div className="fld"><label className="flbl">Tipo</label><select className="fsel" value={form.shiftType} onChange={e=>setField("shiftType",e.target.value)}><option value="">— Sin definir —</option>{SHIFT_TYPES.map(t=><option key={t} value={t}>{t} — {SHIFT_LABELS[t]}</option>)}</select></div>
                    <div className="fld"><label className="flbl">Descanso</label><select className="fsel" value={form.restDay} onChange={e=>setField("restDay",e.target.value)}><option value="">— Sin definir —</option>{DAY_NAMES.map((d,i)=><option key={i} value={i}>{d}</option>)}</select></div>
                    <div className="fld"><label className="flbl">Cobertura min (%)</label><input className="finp" type="number" min="0" max="100" value={form.minCoverage} onChange={e=>setField("minCoverage",e.target.value)} placeholder="80"/></div>
                  </div>
                  <div className="tog-row">
                    <span className="flbl">Rotación de personal</span>
                    <button className={"tog-btn"+(form.rotation?" on":"")} onClick={()=>setField("rotation",!form.rotation)}>
                      <span className="tog-thumb"/><span className="tog-lbl">{form.rotation?"Sí":"No"}</span>
                    </button>
                  </div>
                </section>
                <section className="fsec">
                  <div className="sec-hd"><p className="slbl">👥 Posiciones</p><button className="add-btn" onClick={addPos}>+ Agregar</button></div>
                  {form.requiredPositions.length===0&&<p className="emp-pos">Sin posiciones definidas.</p>}
                  {form.requiredPositions.map((p,i)=>(
                    <div key={i} className="pos-row">
                      <div className="pos-flds">
                        <div className="fld"><label className="flbl">Turno</label><select className="fsel" value={p.preferredShift} onChange={e=>updatePos(i,"preferredShift",e.target.value)}><option value="dia">☀️ Día</option><option value="noche">🌙 Noche</option></select></div>
                        <div className="fld" style={{maxWidth:90}}><label className="flbl">Cant.</label><input className="finp" type="number" min="1" value={p.quantity} onChange={e=>updatePos(i,"quantity",e.target.value)}/></div>
                        <div className="fld" style={{flex:1}}><label className="flbl">Categoría</label><input className="finp" value={p.requiredCategory} onChange={e=>updatePos(i,"requiredCategory",e.target.value)} placeholder="A, supervisor…"/></div>
                      </div>
                      <button className="rem-btn" onClick={()=>removePos(i)}>✕</button>
                    </div>
                  ))}
                </section>
                <section className="fsec">
                  <p className="slbl">📝 Notas</p>
                  <textarea className="ftxt" rows={3} value={form.notes} onChange={e=>setField("notes",e.target.value)} placeholder="Observaciones internas…"/>
                </section>
              </div>
              <div className="sheet-ftr">
                {saveOk
                  ? <div className="save-ok">✓ Cambios guardados</div>
                  : <><button className="btn-pri" onClick={handleSave} disabled={saving||!form.name.trim()}>{saving?<><span className="bspin"/>Guardando…</>:"Guardar cambios"}</button><button className="btn-sec" onClick={closeEdit}>Cancelar</button></>
                }
              </div>
            </div>
          </div>
        )}

        {/* Modal confirmación */}
        {confirm&&(()=>{
          const u=units.find(x=>x.id===confirm);
          return(
            <div className="overlay" onClick={()=>setConfirm(null)}>
              <div className="confirm-box" onClick={e=>e.stopPropagation()}>
                <div className="orn-diamond" style={{margin:"0 auto 16px"}}/>
                <h3 className="modal-ttl" style={{textAlign:"center",marginBottom:10}}>¿Desactivar unidad?</h3>
                <p className="conf-desc">La unidad <strong>{u?.name}</strong> será marcada como inactiva.</p>
                <div className="conf-acts">
                  <button className="btn-pri btn-danger" onClick={()=>handleDeactivate(confirm)}>Sí, desactivar</button>
                  <button className="btn-sec" onClick={()=>setConfirm(null)}>Cancelar</button>
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
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Montserrat:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --gold:#C9A84C;--gold-light:#E8C97A;--gold-dark:#8B6914;
  --black:#0A0A0A;--black-mid:#111111;--black-card:#161616;
  --white:#F5F0E8;--white-dim:rgba(245,240,232,0.6);
  --border:rgba(201,168,76,0.18);
  --danger:#E57373;--success:#81C784;--blue:#4DA3FF;
}
body{background:var(--black);font-family:'Montserrat',sans-serif;overflow-x:hidden}

/* ── Wrapper — idéntico a home ── */
.page-wrap{
  min-height:100vh;background:var(--black);
  position:relative;overflow-x:hidden;
  padding:40px 20px 60px;
}
.page-wrap::before{
  content:'';position:fixed;inset:0;
  background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);
  background-size:60px 60px;pointer-events:none;z-index:0;
}
.page-wrap::after{
  content:'';position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
  width:700px;height:700px;
  background:radial-gradient(ellipse,rgba(201,168,76,.07) 0%,transparent 70%);
  pointer-events:none;z-index:0;
}
.page-inner{position:relative;z-index:1}

/* Esquinas — idénticas a home */
.corner{position:fixed;width:40px;height:40px;z-index:5;opacity:.4}
.corner-tl{top:20px;left:20px;border-top:1px solid var(--gold);border-left:1px solid var(--gold)}
.corner-tr{top:20px;right:20px;border-top:1px solid var(--gold);border-right:1px solid var(--gold)}
.corner-bl{bottom:20px;left:20px;border-bottom:1px solid var(--gold);border-left:1px solid var(--gold)}
.corner-br{bottom:20px;right:20px;border-bottom:1px solid var(--gold);border-right:1px solid var(--gold)}

/* Ornamento — idéntico a home */
.ornament{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.orn-line{height:1px;width:60px;background:linear-gradient(90deg,transparent,var(--gold))}
.orn-line.right{background:linear-gradient(90deg,var(--gold),transparent)}
.orn-diamond{width:8px;height:8px;background:var(--gold);transform:rotate(45deg);box-shadow:0 0 12px rgba(201,168,76,.6);flex-shrink:0}

/* Header */
@keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.page-header{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-bottom:32px;animation:fadeUp .9s ease .1s both}
.eyebrow{font-size:10px;font-weight:600;letter-spacing:6px;text-transform:uppercase;color:var(--gold);margin-bottom:8px}
.page-title{font-family:'Cormorant Garamond',serif;font-size:clamp(32px,7vw,64px);font-weight:300;line-height:1.05;color:var(--white);letter-spacing:-1px}
.page-title span{color:var(--gold);font-style:italic;font-weight:600}
.hdr-actions{display:flex;gap:10px;flex-wrap:wrap;width:100%}

/* Botones — misma forma que home */
.btn-pri{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:14px 28px;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:600;
  letter-spacing:3px;text-transform:uppercase;color:var(--black);
  background:linear-gradient(135deg,var(--gold-light),var(--gold),var(--gold-dark));
  clip-path:polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%);
  border:none;cursor:pointer;transition:all .3s ease;white-space:nowrap;flex:1;
  box-shadow:0 4px 24px rgba(201,168,76,.3),0 0 60px rgba(201,168,76,.1);
}
.btn-pri:hover:not(:disabled){background:linear-gradient(135deg,var(--white),var(--gold-light),var(--gold));box-shadow:0 6px 36px rgba(201,168,76,.5);transform:translateY(-2px);letter-spacing:4px}
.btn-pri:disabled{opacity:.4;cursor:not-allowed}
.btn-danger{background:linear-gradient(135deg,#ef9a9a,var(--danger),#c62828)!important}
.btn-sec{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:14px 24px;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:500;
  letter-spacing:2px;text-transform:uppercase;color:var(--white-dim);
  background:transparent;border:1px solid var(--border);
  clip-path:polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%);
  cursor:pointer;transition:all .3s ease;white-space:nowrap;flex:1;
}
.btn-sec:hover{border-color:var(--gold);color:var(--white);background:rgba(201,168,76,.05)}
.badge-num{background:var(--danger);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;margin-left:2px}

/* ── Tarjetas móvil ── */
.cards-wrap{display:flex;flex-direction:column;gap:12px;animation:fadeUp .9s ease .2s both}
.tbl-wrap{display:none}
.unit-card{
  background:var(--black-card);border:1px solid var(--border);
  padding:18px;position:relative;transition:border-color .3s;
}
.unit-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent);opacity:.25}
.unit-card:hover{border-color:rgba(201,168,76,.35)}
.uc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px}
.uc-name{display:block;font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:400;color:var(--white);margin-bottom:3px}
.uc-addr{display:block;font-size:10px;color:var(--white-dim);letter-spacing:1px}
.uc-bdgs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}
.uc-pos{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px}
.uc-acts{display:flex;gap:8px}
.act-btn{
  flex:1;padding:10px;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:600;
  letter-spacing:2px;text-transform:uppercase;background:transparent;
  border:1px solid var(--border);color:var(--white-dim);cursor:pointer;transition:all .2s;
  clip-path:polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%);
}
.act-btn:hover{border-color:var(--gold);color:var(--gold);background:rgba(201,168,76,.05)}
.act-danger:hover{border-color:var(--danger);color:var(--danger);background:rgba(229,115,115,.05)}

/* ── Badges ── */
.bdg{font-size:9px;font-weight:600;padding:3px 10px;letter-spacing:.5px;display:inline-block;border:1px solid}
.bdg-shift{background:rgba(201,168,76,.1);color:var(--gold);border-color:rgba(201,168,76,.3)}
.bdg-pos  {background:rgba(77,163,255,.08);color:#7BC8FF;border-color:rgba(77,163,255,.25)}
.bdg-rest {background:rgba(180,130,255,.08);color:#C4A0FF;border-color:rgba(180,130,255,.25)}
.bdg-ok   {background:rgba(129,199,132,.08);color:var(--success);border-color:rgba(129,199,132,.3)}
.bdg-cov  {background:rgba(201,168,76,.08);color:var(--gold);border-color:rgba(201,168,76,.2)}
.bdg-rot-on {background:rgba(129,199,132,.08);color:var(--success);border-color:rgba(129,199,132,.3)}
.bdg-rot-off{background:rgba(150,150,150,.08);color:#888;border-color:rgba(150,150,150,.2)}
.pos-list{display:flex;flex-wrap:wrap;gap:4px}

/* ── Tabla desktop ── */
.dtable{width:100%;border-collapse:collapse;min-width:760px;background:var(--black-card)}
.dtable thead tr{border-bottom:1px solid var(--border);background:rgba(201,168,76,.04)}
.dtable th{padding:12px 14px;text-align:left;font-size:9px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--gold);white-space:nowrap}
.dtable tbody tr{border-bottom:1px solid rgba(201,168,76,.06);transition:background .15s}
.dtable tbody tr:hover{background:rgba(201,168,76,.03)}
.dtable td{padding:12px 14px;font-size:12px;color:var(--white);vertical-align:middle}
.td-name{font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:400}
.td-dim{color:var(--white-dim)}
.td-nil{color:rgba(245,240,232,.2);font-size:11px}
.row-acts{display:flex;gap:5px}
.ico-btn{background:none;border:1px solid var(--border);color:var(--white-dim);width:30px;height:30px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;transition:all .2s;clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)}
.ico-btn:hover{border-color:var(--gold);background:rgba(201,168,76,.08)}
.ico-danger:hover{border-color:var(--danger);background:rgba(229,115,115,.08)}

/* Loading / Empty */
.loading{display:flex;align-items:center;gap:12px;padding:80px 20px;color:var(--white-dim);font-size:12px;letter-spacing:2px;justify-content:center;animation:fadeUp .9s ease both}
.spin{width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.empty{padding:60px 20px;color:var(--white-dim);text-align:center;letter-spacing:1px;animation:fadeUp .9s ease both}

/* ── Modal ── */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(12px);display:flex;justify-content:center;align-items:flex-end;z-index:10000}
.sheet{
  background:var(--black-mid);
  border:1px solid rgba(201,168,76,.25);border-bottom:none;
  width:100%;max-width:640px;max-height:92vh;
  display:flex;flex-direction:column;
  border-radius:16px 16px 0 0;
  box-shadow:0 -24px 80px rgba(0,0,0,.9);
  animation:slideUp .3s ease both;overflow:hidden;
}
@keyframes slideUp{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
.sheet-hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:22px 22px 16px;border-bottom:1px solid rgba(201,168,76,.1);flex-shrink:0}
.modal-ttl{font-family:'Cormorant Garamond',serif;font-size:clamp(18px,4vw,26px);font-weight:300;color:var(--white)}
.close-btn{background:none;border:1px solid rgba(255,255,255,.1);color:var(--white-dim);width:32px;height:32px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .2s;clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%);flex-shrink:0}
.close-btn:hover{border-color:var(--danger);color:var(--danger)}
.sheet-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:18px 22px;display:flex;flex-direction:column;gap:20px}
.fsec{display:flex;flex-direction:column;gap:12px}
.sec-hd{display:flex;justify-content:space-between;align-items:center}
.slbl{font-size:9px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:var(--gold);padding-bottom:8px;border-bottom:1px solid rgba(201,168,76,.1)}
.g2{display:grid;grid-template-columns:1fr;gap:10px}
.g3{display:grid;grid-template-columns:1fr;gap:10px}
.fld{display:flex;flex-direction:column;gap:6px}
.flbl{font-size:8px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--gold);opacity:.8}
.finp,.fsel,.ftxt{background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--white);padding:12px 13px;font-family:'Montserrat',sans-serif;font-size:14px;outline:none;width:100%;transition:border-color .2s;-webkit-appearance:none}
.finp:focus,.fsel:focus,.ftxt:focus{border-color:var(--gold)}
.finp::placeholder,.ftxt::placeholder{color:rgba(245,240,232,.2)}
.fsel option{background:#1a1a1a;color:var(--white)}
.ftxt{resize:vertical;min-height:80px;line-height:1.5}
.tog-row{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(201,168,76,.03);border:1px solid rgba(201,168,76,.1)}
.tog-btn{display:flex;align-items:center;gap:8px;background:rgba(100,100,100,.12);border:1px solid rgba(100,100,100,.2);padding:7px 14px 7px 7px;cursor:pointer;transition:all .25s}
.tog-btn.on{background:rgba(129,199,132,.1);border-color:rgba(129,199,132,.3)}
.tog-thumb{width:18px;height:18px;background:rgba(150,150,150,.5);transition:all .25s;flex-shrink:0}
.tog-btn.on .tog-thumb{background:var(--success)}
.tog-lbl{font-size:10px;font-weight:600;color:var(--white-dim);transition:color .2s}
.tog-btn.on .tog-lbl{color:var(--success)}
.add-btn{background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.25);color:var(--gold);font-family:'Montserrat',sans-serif;font-size:9px;font-weight:600;letter-spacing:2px;padding:6px 14px;cursor:pointer;transition:all .2s;clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)}
.add-btn:hover{background:rgba(201,168,76,.14)}
.emp-pos{font-size:11px;color:var(--white-dim);font-style:italic;padding:6px 0}
.pos-row{display:flex;align-items:flex-end;gap:8px;padding:12px;background:rgba(201,168,76,.03);border:1px solid rgba(201,168,76,.07)}
.pos-flds{flex:1;display:flex;flex-direction:column;gap:8px}
.rem-btn{background:none;border:1px solid rgba(229,115,115,.25);color:rgba(229,115,115,.6);width:30px;height:30px;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;align-self:flex-end}
.rem-btn:hover{border-color:var(--danger);color:var(--danger);background:rgba(229,115,115,.08)}
.sheet-ftr{padding:14px 22px;border-top:1px solid rgba(201,168,76,.1);display:flex;gap:8px;flex-shrink:0;background:var(--black-mid)}
.sheet-ftr .btn-pri,.sheet-ftr .btn-sec{flex:1}
.save-ok{flex:1;text-align:center;font-size:11px;font-weight:600;color:var(--success);padding:14px;background:rgba(129,199,132,.06);border:1px solid rgba(129,199,132,.2);letter-spacing:1px}
.bspin{width:11px;height:11px;border:2px solid rgba(0,0,0,.3);border-top-color:var(--black);border-radius:50%;animation:spin .6s linear infinite;display:inline-block;margin-right:4px}
.confirm-box{
  background:var(--black-mid);border:1px solid rgba(229,115,115,.2);
  padding:28px 22px;width:calc(100% - 32px);max-width:400px;
  display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;
  box-shadow:0 20px 60px rgba(0,0,0,.8);border-radius:4px;margin:16px;
}
.conf-desc{font-size:12px;color:var(--white-dim);line-height:1.7}
.conf-desc strong{color:var(--white)}
.conf-acts{display:flex;flex-direction:column;gap:8px;width:100%}
.conf-acts .btn-pri,.conf-acts .btn-sec{flex:1}

/* ── Desktop ── */
@media(min-width:640px){
  .page-wrap{padding:48px 40px 60px}
  .hdr-actions{width:auto}
  .btn-pri,.btn-sec{flex:initial}
  .g2{grid-template-columns:1fr 1fr}
  .g3{grid-template-columns:1fr 1fr 1fr}
  .pos-flds{flex-direction:row;align-items:flex-end}
}
@media(min-width:768px){
  .cards-wrap{display:none}
  .tbl-wrap{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);animation:fadeUp .9s ease .2s both}
  .overlay{align-items:center}
  .sheet{border-radius:4px;border-bottom:1px solid rgba(201,168,76,.25);animation:none;max-height:85vh}
  .confirm-box{padding:36px 32px;margin:0;border-radius:4px}
  .conf-acts{flex-direction:row}
}
@media(min-width:1024px){
  .page-wrap{padding:60px 60px 80px}
}
`;