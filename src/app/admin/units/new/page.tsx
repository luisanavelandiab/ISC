"use client";

import { useState } from "react";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SHIFT_TYPES = ["A", "B", "C", "D", "E"] as const;
const SHIFT_LABELS: Record<string, string> = {
  A: "7×0 Permanente",
  B: "6×1 Individual",
  C: "6×1 Común",
  D: "4×2 Rotativo",
  E: "1 Fijo + 2 Rotativos",
};
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface PositionRow {
  preferredShift: "dia" | "noche";
  quantity: string;
  requiredCategory: string;
}

const defaultForm = {
  name: "",
  address: "",
  shiftType: "",
  restDay: "",
  rotation: false,
  minCoverage: "",
  notes: "",
};

export default function NewUnitPage() {
  const router = useRouter();
  const [form, setForm] = useState(defaultForm);
  const [positions, setPositions] = useState<PositionRow[]>([
    { preferredShift: "dia", quantity: "1", requiredCategory: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function updatePos(i: number, k: keyof PositionRow, v: string) {
    setPositions((p) => {
      const next = [...p];
      next[i] = { ...next[i], [k]: v } as PositionRow;
      return next;
    });
  }

  function addPos() {
    setPositions((p) => [
      ...p,
      { preferredShift: "dia", quantity: "1", requiredCategory: "" },
    ]);
  }

  function removePos(i: number) {
    setPositions((p) => p.filter((_, idx) => idx !== i));
  }

  const canAdvance = step === 1 ? form.name.trim().length > 0 : true;

  async function handleSubmit() {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const data: Record<string, unknown> = {
        name: form.name.trim(),
        address: form.address.trim(),
        status: "Activo",
        createdAt: Timestamp.now(),
        requiredPositions: positions.map((p) => ({
          shiftType: p.preferredShift,
          quantity: Number(p.quantity) || 1,
          preferredShift: p.preferredShift,
          requiredCategory: p.requiredCategory.trim(),
        })),
      };
      if (form.shiftType) data.shiftType = form.shiftType;
      if (form.restDay !== "") data.restDay = Number(form.restDay);
      data.rotation = form.rotation;
      if (form.minCoverage !== "") data.minCoverage = Number(form.minCoverage);
      if (form.notes.trim()) data.notes = form.notes.trim();

      await addDoc(collection(db, "units"), data);
      router.push("/admin/units");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="page-wrap">
        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />

        <div className="page-inner">
          {/* Header */}
          <div className="page-header">
            <div>
              <div className="ornament">
                <div className="orn-line" />
                <div className="orn-diamond" />
                <div className="orn-line right" />
              </div>
              <p className="eyebrow">Nueva unidad</p>
              <h1 className="page-title">
                Crear <span>Unidad</span>
              </h1>
            </div>
            <Link href="/admin/units">
              <button className="btn-sec">← Volver</button>
            </Link>
          </div>

          {/* Step indicator */}
          <div className="steps-row">
            {[
              { n: 1, label: "Identificación" },
              { n: 2, label: "Turno" },
              { n: 3, label: "Posiciones" },
              { n: 4, label: "Notas" },
            ].map(({ n, label }) => (
              <button
                key={n}
                className={`step-item${step === n ? " active" : ""}${n < step ? " done" : ""}`}
                onClick={() => n < step || canAdvance ? setStep(n) : undefined}
              >
                <span className="step-num">{n < step ? "✓" : n}</span>
                <span className="step-lbl">{label}</span>
              </button>
            ))}
          </div>

          {/* Card */}
          <div className="form-card">
            {/* ─── Step 1: Identificación ─── */}
            {step === 1 && (
              <div className="step-body" key="s1">
                <p className="slbl">📋 Información básica</p>
                <div className="g2">
                  <div className="fld">
                    <label className="flbl">Nombre *</label>
                    <input
                      className="finp"
                      value={form.name}
                      onChange={(e) => setField("name", e.target.value)}
                      placeholder="Ej: Sede Central Norte"
                      autoFocus
                    />
                  </div>
                  <div className="fld">
                    <label className="flbl">Dirección</label>
                    <input
                      className="finp"
                      value={form.address}
                      onChange={(e) => setField("address", e.target.value)}
                      placeholder="Ej: Av. Principal 123"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 2: Turno ─── */}
            {step === 2 && (
              <div className="step-body" key="s2">
                <p className="slbl">⏰ Configuración de turno</p>
                <div className="g3">
                  <div className="fld">
                    <label className="flbl">Tipo de turno</label>
                    <select
                      className="fsel"
                      value={form.shiftType}
                      onChange={(e) => setField("shiftType", e.target.value)}
                    >
                      <option value="">— Sin definir —</option>
                      {SHIFT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t} — {SHIFT_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="fld">
                    <label className="flbl">Día de descanso</label>
                    <select
                      className="fsel"
                      value={form.restDay}
                      onChange={(e) => setField("restDay", e.target.value)}
                    >
                      <option value="">— Sin definir —</option>
                      {DAY_NAMES.map((d, i) => (
                        <option key={i} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="fld">
                    <label className="flbl">Cobertura mínima (%)</label>
                    <input
                      className="finp"
                      type="number"
                      min="0"
                      max="100"
                      value={form.minCoverage}
                      onChange={(e) => setField("minCoverage", e.target.value)}
                      placeholder="80"
                    />
                  </div>
                </div>

                {form.shiftType && (
                  <div className="shift-preview">
                    <span className="bdg bdg-shift" style={{ fontSize: 11, padding: "6px 14px" }}>
                      {form.shiftType} — {SHIFT_LABELS[form.shiftType]}
                    </span>
                  </div>
                )}

                <div className="tog-row">
                  <div>
                    <span className="flbl">Rotación de personal</span>
                    <p className="tog-hint">Activa si el personal rota entre diferentes unidades</p>
                  </div>
                  <button
                    className={"tog-btn" + (form.rotation ? " on" : "")}
                    onClick={() => setField("rotation", !form.rotation)}
                    type="button"
                  >
                    <span className="tog-thumb" />
                    <span className="tog-lbl">{form.rotation ? "Sí" : "No"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* ─── Step 3: Posiciones ─── */}
            {step === 3 && (
              <div className="step-body" key="s3">
                <div className="sec-hd">
                  <p className="slbl">👥 Posiciones requeridas</p>
                  <button className="add-btn" onClick={addPos} type="button">
                    + Agregar posición
                  </button>
                </div>

                {positions.length === 0 && (
                  <div className="emp-state">
                    <p>No hay posiciones definidas.</p>
                    <button className="add-btn" onClick={addPos} type="button" style={{ marginTop: 12 }}>
                      + Agregar primera posición
                    </button>
                  </div>
                )}

                <div className="pos-list-wrap">
                  {positions.map((p, i) => (
                    <div key={i} className="pos-row">
                      <div className="pos-idx">{i + 1}</div>
                      <div className="pos-flds">
                        <div className="fld" style={{ minWidth: 120 }}>
                          <label className="flbl">Turno</label>
                          <select
                            className="fsel"
                            value={p.preferredShift}
                            onChange={(e) => updatePos(i, "preferredShift", e.target.value)}
                          >
                            <option value="dia">☀️ Día</option>
                            <option value="noche">🌙 Noche</option>
                          </select>
                        </div>
                        <div className="fld" style={{ maxWidth: 90 }}>
                          <label className="flbl">Cantidad</label>
                          <input
                            className="finp"
                            type="number"
                            min="1"
                            value={p.quantity}
                            onChange={(e) => updatePos(i, "quantity", e.target.value)}
                          />
                        </div>
                        <div className="fld" style={{ flex: 1 }}>
                          <label className="flbl">Categoría requerida</label>
                          <input
                            className="finp"
                            value={p.requiredCategory}
                            onChange={(e) => updatePos(i, "requiredCategory", e.target.value)}
                            placeholder="A, supervisor, especialista…"
                          />
                        </div>
                      </div>
                      <button
                        className="rem-btn"
                        onClick={() => removePos(i)}
                        type="button"
                        title="Eliminar posición"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {positions.length > 0 && (
                  <div className="pos-summary">
                    <span className="bdg bdg-pos">
                      {positions.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0)} agentes total
                    </span>
                    <span className="bdg bdg-shift">
                      {positions.filter((p) => p.preferredShift === "dia").reduce((a, p) => a + (Number(p.quantity) || 0), 0)} día
                    </span>
                    <span className="bdg bdg-rest">
                      {positions.filter((p) => p.preferredShift === "noche").reduce((a, p) => a + (Number(p.quantity) || 0), 0)} noche
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ─── Step 4: Notas + resumen ─── */}
            {step === 4 && (
              <div className="step-body" key="s4">
                <p className="slbl">📝 Notas y confirmación</p>
                <div className="fld">
                  <label className="flbl">Notas internas</label>
                  <textarea
                    className="ftxt"
                    rows={4}
                    value={form.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                    placeholder="Observaciones, instrucciones especiales, contexto para el equipo…"
                  />
                </div>

                {/* Resumen */}
                <div className="summary-box">
                  <p className="slbl" style={{ marginBottom: 14 }}>✅ Resumen de la unidad</p>
                  <div className="sum-grid">
                    <div className="sum-item">
                      <span className="sum-k">Nombre</span>
                      <span className="sum-v">{form.name || <em>—</em>}</span>
                    </div>
                    <div className="sum-item">
                      <span className="sum-k">Dirección</span>
                      <span className="sum-v">{form.address || <em>—</em>}</span>
                    </div>
                    <div className="sum-item">
                      <span className="sum-k">Tipo de turno</span>
                      <span className="sum-v">
                        {form.shiftType ? (
                          <span className="bdg bdg-shift" style={{ fontSize: 10 }}>
                            {form.shiftType} — {SHIFT_LABELS[form.shiftType]}
                          </span>
                        ) : (
                          <em>—</em>
                        )}
                      </span>
                    </div>
                    <div className="sum-item">
                      <span className="sum-k">Descanso</span>
                      <span className="sum-v">
                        {form.restDay !== "" ? (
                          <span className="bdg bdg-rest" style={{ fontSize: 10 }}>
                            {DAY_NAMES[Number(form.restDay)]}
                          </span>
                        ) : (
                          <em>—</em>
                        )}
                      </span>
                    </div>
                    <div className="sum-item">
                      <span className="sum-k">Cobertura mín.</span>
                      <span className="sum-v">
                        {form.minCoverage ? (
                          <span className="bdg bdg-cov" style={{ fontSize: 10 }}>
                            {form.minCoverage}%
                          </span>
                        ) : (
                          <em>—</em>
                        )}
                      </span>
                    </div>
                    <div className="sum-item">
                      <span className="sum-k">Rotación</span>
                      <span className="sum-v">
                        <span
                          className={`bdg ${form.rotation ? "bdg-rot-on" : "bdg-rot-off"}`}
                          style={{ fontSize: 10 }}
                        >
                          {form.rotation ? "Sí" : "No"}
                        </span>
                      </span>
                    </div>
                    <div className="sum-item" style={{ gridColumn: "1 / -1" }}>
                      <span className="sum-k">Posiciones</span>
                      <span className="sum-v" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {positions.length === 0 ? (
                          <em>—</em>
                        ) : (
                          positions.map((p, i) => (
                            <span key={i} className="bdg bdg-pos" style={{ fontSize: 10 }}>
                              {p.preferredShift === "dia" ? "☀️" : "🌙"} {p.quantity}
                              {p.requiredCategory ? ` · ${p.requiredCategory}` : ""}
                            </span>
                          ))
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer navigation */}
            <div className="form-ftr">
              {step > 1 && (
                <button className="btn-sec" onClick={() => setStep((s) => s - 1)} type="button">
                  ← Atrás
                </button>
              )}
              {step < 4 ? (
                <button
                  className="btn-pri"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canAdvance}
                  type="button"
                >
                  Continuar →
                </button>
              ) : (
                <button
                  className="btn-pri"
                  onClick={handleSubmit}
                  disabled={loading || !form.name.trim()}
                  type="button"
                >
                  {loading ? (
                    <>
                      <span className="bspin" />
                      Creando unidad…
                    </>
                  ) : (
                    "✓ Crear unidad"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
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

/* Page wrapper */
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
.page-inner{position:relative;z-index:1;max-width:720px;margin:0 auto}

/* Corners */
.corner{position:fixed;width:40px;height:40px;z-index:5;opacity:.4}
.corner-tl{top:20px;left:20px;border-top:1px solid var(--gold);border-left:1px solid var(--gold)}
.corner-tr{top:20px;right:20px;border-top:1px solid var(--gold);border-right:1px solid var(--gold)}
.corner-bl{bottom:20px;left:20px;border-bottom:1px solid var(--gold);border-left:1px solid var(--gold)}
.corner-br{bottom:20px;right:20px;border-bottom:1px solid var(--gold);border-right:1px solid var(--gold)}

/* Ornament */
.ornament{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.orn-line{height:1px;width:60px;background:linear-gradient(90deg,transparent,var(--gold))}
.orn-line.right{background:linear-gradient(90deg,var(--gold),transparent)}
.orn-diamond{width:8px;height:8px;background:var(--gold);transform:rotate(45deg);box-shadow:0 0 12px rgba(201,168,76,.6);flex-shrink:0}

/* Header */
@keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.page-header{
  display:flex;justify-content:space-between;align-items:flex-end;
  flex-wrap:wrap;gap:16px;margin-bottom:32px;
  animation:fadeUp .9s ease .1s both;
}
.eyebrow{font-size:10px;font-weight:600;letter-spacing:6px;text-transform:uppercase;color:var(--gold);margin-bottom:8px}
.page-title{font-family:'Cormorant Garamond',serif;font-size:clamp(32px,7vw,56px);font-weight:300;line-height:1.05;color:var(--white);letter-spacing:-1px}
.page-title span{color:var(--gold);font-style:italic;font-weight:600}

/* Buttons */
.btn-pri{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:14px 28px;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:600;
  letter-spacing:3px;text-transform:uppercase;color:var(--black);
  background:linear-gradient(135deg,var(--gold-light),var(--gold),var(--gold-dark));
  clip-path:polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%);
  border:none;cursor:pointer;transition:all .3s ease;white-space:nowrap;
  box-shadow:0 4px 24px rgba(201,168,76,.3),0 0 60px rgba(201,168,76,.1);
}
.btn-pri:hover:not(:disabled){background:linear-gradient(135deg,var(--white),var(--gold-light),var(--gold));box-shadow:0 6px 36px rgba(201,168,76,.5);transform:translateY(-2px);letter-spacing:4px}
.btn-pri:disabled{opacity:.4;cursor:not-allowed}
.btn-sec{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:14px 24px;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:500;
  letter-spacing:2px;text-transform:uppercase;color:var(--white-dim);
  background:transparent;border:1px solid var(--border);
  clip-path:polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%);
  cursor:pointer;transition:all .3s ease;white-space:nowrap;
}
.btn-sec:hover{border-color:var(--gold);color:var(--white);background:rgba(201,168,76,.05)}

/* Step indicator */
.steps-row{
  display:flex;gap:0;margin-bottom:28px;
  border:1px solid var(--border);
  animation:fadeUp .9s ease .2s both;
  overflow:hidden;
}
.step-item{
  flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;
  padding:12px 8px;background:transparent;border:none;
  border-right:1px solid var(--border);cursor:pointer;
  transition:all .25s;position:relative;
}
.step-item:last-child{border-right:none}
.step-item::after{
  content:'';position:absolute;bottom:0;left:0;right:0;height:2px;
  background:var(--gold);transform:scaleX(0);transition:transform .3s;
}
.step-item.active::after,.step-item.done::after{transform:scaleX(1)}
.step-item.active{background:rgba(201,168,76,.06)}
.step-item.done{background:rgba(129,199,132,.04)}
.step-num{
  width:22px;height:22px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:10px;font-weight:700;
  border:1px solid rgba(201,168,76,.3);color:var(--white-dim);
  transition:all .25s;
}
.step-item.active .step-num{border-color:var(--gold);color:var(--gold);background:rgba(201,168,76,.1);box-shadow:0 0 10px rgba(201,168,76,.3)}
.step-item.done .step-num{border-color:var(--success);color:var(--success);background:rgba(129,199,132,.1)}
.step-lbl{font-size:8px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--white-dim);transition:color .25s}
.step-item.active .step-lbl{color:var(--gold)}
.step-item.done .step-lbl{color:var(--success)}

/* Form card */
.form-card{
  background:var(--black-card);border:1px solid var(--border);
  position:relative;overflow:hidden;
  animation:fadeUp .9s ease .3s both;
}
.form-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--gold),transparent);
  opacity:.35;
}

/* Step body */
.step-body{padding:28px 22px;display:flex;flex-direction:column;gap:18px;min-height:280px}

/* Form elements */
.slbl{font-size:9px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:var(--gold);padding-bottom:10px;border-bottom:1px solid rgba(201,168,76,.1)}
.sec-hd{display:flex;justify-content:space-between;align-items:center}
.g2{display:grid;grid-template-columns:1fr;gap:12px}
.g3{display:grid;grid-template-columns:1fr;gap:12px}
.fld{display:flex;flex-direction:column;gap:6px}
.flbl{font-size:8px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--gold);opacity:.8}
.finp,.fsel,.ftxt{
  background:rgba(255,255,255,.03);border:1px solid var(--border);
  color:var(--white);padding:13px 14px;
  font-family:'Montserrat',sans-serif;font-size:14px;
  outline:none;width:100%;transition:border-color .2s;-webkit-appearance:none;
}
.finp:focus,.fsel:focus,.ftxt:focus{border-color:var(--gold);background:rgba(201,168,76,.02)}
.finp::placeholder,.ftxt::placeholder{color:rgba(245,240,232,.2)}
.fsel option{background:#1a1a1a;color:var(--white)}
.ftxt{resize:vertical;min-height:100px;line-height:1.6}

/* Toggle */
.tog-row{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 16px;background:rgba(201,168,76,.03);border:1px solid rgba(201,168,76,.1);
  gap:12px;
}
.tog-hint{font-size:10px;color:var(--white-dim);margin-top:3px;letter-spacing:.3px}
.tog-btn{
  display:flex;align-items:center;gap:8px;
  background:rgba(100,100,100,.12);border:1px solid rgba(100,100,100,.2);
  padding:8px 16px 8px 8px;cursor:pointer;transition:all .25s;flex-shrink:0;
}
.tog-btn.on{background:rgba(129,199,132,.1);border-color:rgba(129,199,132,.3)}
.tog-thumb{width:18px;height:18px;background:rgba(150,150,150,.5);transition:all .25s;flex-shrink:0}
.tog-btn.on .tog-thumb{background:var(--success)}
.tog-lbl{font-size:10px;font-weight:600;color:var(--white-dim);transition:color .2s;min-width:18px}
.tog-btn.on .tog-lbl{color:var(--success)}

/* Shift preview */
.shift-preview{display:flex;gap:8px;flex-wrap:wrap;padding:4px 0}

/* Positions */
.add-btn{
  background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.25);
  color:var(--gold);font-family:'Montserrat',sans-serif;font-size:9px;
  font-weight:600;letter-spacing:2px;padding:8px 16px;cursor:pointer;
  transition:all .2s;clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%);
  white-space:nowrap;
}
.add-btn:hover{background:rgba(201,168,76,.14)}
.emp-state{
  padding:32px 20px;text-align:center;
  color:var(--white-dim);font-size:12px;letter-spacing:.5px;
  border:1px dashed rgba(201,168,76,.15);
}
.pos-list-wrap{display:flex;flex-direction:column;gap:10px}
.pos-row{
  display:flex;align-items:flex-end;gap:10px;
  padding:14px;background:rgba(201,168,76,.03);
  border:1px solid rgba(201,168,76,.08);
  position:relative;
}
.pos-idx{
  width:24px;height:24px;border:1px solid rgba(201,168,76,.25);
  display:flex;align-items:center;justify-content:center;
  font-size:9px;font-weight:700;color:var(--gold);
  flex-shrink:0;align-self:flex-end;margin-bottom:2px;
}
.pos-flds{flex:1;display:flex;flex-direction:column;gap:10px}
.rem-btn{
  background:none;border:1px solid rgba(229,115,115,.25);
  color:rgba(229,115,115,.6);width:32px;height:32px;
  cursor:pointer;font-size:11px;display:flex;align-items:center;
  justify-content:center;flex-shrink:0;transition:all .15s;
  align-self:flex-end;
}
.rem-btn:hover{border-color:var(--danger);color:var(--danger);background:rgba(229,115,115,.08)}
.pos-summary{display:flex;flex-wrap:wrap;gap:6px;padding-top:4px}

/* Summary box */
.summary-box{
  background:rgba(201,168,76,.03);border:1px solid rgba(201,168,76,.1);
  padding:20px;
}
.sum-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sum-item{display:flex;flex-direction:column;gap:5px}
.sum-k{font-size:8px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--gold);opacity:.7}
.sum-v{font-size:13px;color:var(--white);font-family:'Cormorant Garamond',serif}
.sum-v em{color:rgba(245,240,232,.25);font-style:italic;font-size:12px;font-family:'Montserrat',sans-serif}

/* Badges */
.bdg{font-size:9px;font-weight:600;padding:3px 10px;letter-spacing:.5px;display:inline-block;border:1px solid}
.bdg-shift{background:rgba(201,168,76,.1);color:var(--gold);border-color:rgba(201,168,76,.3)}
.bdg-pos  {background:rgba(77,163,255,.08);color:#7BC8FF;border-color:rgba(77,163,255,.25)}
.bdg-rest {background:rgba(180,130,255,.08);color:#C4A0FF;border-color:rgba(180,130,255,.25)}
.bdg-cov  {background:rgba(201,168,76,.08);color:var(--gold);border-color:rgba(201,168,76,.2)}
.bdg-rot-on{background:rgba(129,199,132,.08);color:var(--success);border-color:rgba(129,199,132,.3)}
.bdg-rot-off{background:rgba(150,150,150,.08);color:#888;border-color:rgba(150,150,150,.2)}

/* Footer */
.form-ftr{
  display:flex;justify-content:flex-end;gap:10px;
  padding:16px 22px;border-top:1px solid rgba(201,168,76,.1);
  background:rgba(0,0,0,.2);
}
.form-ftr .btn-pri,.form-ftr .btn-sec{min-width:140px}

/* Loading spinner */
.bspin{width:11px;height:11px;border:2px solid rgba(0,0,0,.3);border-top-color:var(--black);border-radius:50%;animation:spin .6s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}

/* Desktop */
@media(min-width:600px){
  .g2{grid-template-columns:1fr 1fr}
  .g3{grid-template-columns:1fr 1fr 1fr}
  .pos-flds{flex-direction:row;align-items:flex-end}
}
@media(min-width:640px){
  .page-wrap{padding:48px 40px 60px}
}
@media(min-width:1024px){
  .page-wrap{padding:60px 60px 80px}
}
`;