/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  collection, onSnapshot, query, orderBy,
  doc, updateDoc, Timestamp, getDocs, where,
} from "firebase/firestore";
import { db, auth } from "@/services/firebase";
import Link from "next/link";

type DocType    = "DNI" | "CE";
type Role       = "vigilante" | "descansero" | "supervisor";
type AuthRole   = "vigilante" | "coordinador" | "admin";
type ShiftPref  = "dia" | "noche" | "ambos";
type PersonStatus = "activo" | "inactivo" | "suspendido" | "reingreso";
type RazonSocial  = "CONSULTANS" | "CONSULTANS/CENTRAL" | "CENTRAL";
type FormaPago    = "PRIMER GRUPO" | "SEGUNDO GRUPO" | "TERCER GRUPO" | "OFICINA";

interface Personnel {
  id: string;
  docType: DocType;
  docNumber: string;
  fullName: string;
  phone: string;
  address: string;
  birthDate: string;
  age: number | string;
  photoURL?: string;
  bankAccount: string;
  bank: string;
  role: Role;
  authRole: AuthRole;
  status: PersonStatus;
  startDate: string;
  category: string;
  preferredShift: ShiftPref;
  canRotate?: boolean;
  enPlanilla: boolean;
  razonSocial: RazonSocial | "";
  formaPago: FormaPago | "";
  email?: string;
  password?: string;
  uid?: string;
  guardId?: string;
  createdAt?: any;
  updatedAt?: any;
}

interface Assignment {
  id: string;
  unitName: string;
  shift: "dia" | "noche" | "descanso";
  date: Date;
  status: string;
}

const ROLE_CONFIG: Record<Role, { label: string; icon: string; color: string; bg: string; border: string }> = {
  vigilante:  { label: "Vigilante",  icon: "🛡", color: "#C9A84C", bg: "rgba(201,168,76,.1)",  border: "rgba(201,168,76,.3)"  },
  descansero: { label: "Descansero", icon: "🔄", color: "#4DA3FF", bg: "rgba(77,163,255,.1)",  border: "rgba(77,163,255,.3)"  },
  supervisor: { label: "Supervisor", icon: "⭐", color: "#81C784", bg: "rgba(129,199,132,.1)", border: "rgba(129,199,132,.3)" },
};

const STATUS_CONFIG: Record<PersonStatus, { label: string; color: string; bg: string }> = {
  activo:    { label: "Activo",     color: "#81C784", bg: "rgba(129,199,132,.12)" },
  inactivo:  { label: "Inactivo",   color: "#888",    bg: "rgba(150,150,150,.1)"  },
  suspendido:{ label: "Suspendido", color: "#E57373", bg: "rgba(229,115,115,.1)"  },
  reingreso: { label: "Reingreso",  color: "#C4A0FF", bg: "rgba(196,160,255,.1)"  },
};

const BANKS = ["Interbank", "BCP", "BBVA", "Scotiabank", "CAJA HYO"];
const CATEGORIES = ["A", "B", "C", "Supervisor Jr.", "Supervisor Sr.", "Sin categoría"];

const EMPTY_FORM = (): Omit<Personnel, "id" | "createdAt" | "updatedAt" | "uid"> => ({
  docType: "DNI", docNumber: "",
  fullName: "", phone: "", address: "",
  birthDate: "", age: "",
  photoURL: "", bankAccount: "", bank: "",
  role: "vigilante", authRole: "vigilante",
  status: "activo", startDate: "",
  category: "Sin categoría",
  preferredShift: "dia", canRotate: false,
  enPlanilla: false, razonSocial: "", formaPago: "",
  email: "", password: "",
});

function calcAge(birthDate: string): number | "" {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : "";
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]?.toUpperCase() || "").join("");
}

export default function PersonalPage() {
  const [personnel,     setPersonnel]     = useState<Personnel[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [activeRole,    setActiveRole]    = useState<Role | "todos">("todos");
  const [search,        setSearch]        = useState("");
  const [filterStatus,  setFilterStatus]  = useState<PersonStatus | "todos">("activo");
  const [modal,         setModal]         = useState<"new" | "edit" | "view" | null>(null);
  const [selected,      setSelected]      = useState<Personnel | null>(null);
  const [form,          setForm]          = useState(EMPTY_FORM());
  const [formPassword,  setFormPassword]  = useState("");
  const [saving,        setSaving]        = useState(false);
  const [formError,     setFormError]     = useState("");
  const [successMsg,    setSuccessMsg]    = useState("");
  const [assignments,   setAssignments]   = useState<Assignment[]>([]);
  const [loadingAsgs,   setLoadingAsgs]   = useState(false);
  const [confirmToggle, setConfirmToggle] = useState<Personnel | null>(null);
  const [createdCreds,  setCreatedCreds]  = useState<{ email: string; password: string } | null>(null);
  const [showPass,      setShowPass]      = useState(false); // ver perfil
  const [showFormPass,  setShowFormPass]  = useState(false); // formulario editar

  // ── Firestore ──
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "personnel"), orderBy("fullName", "asc")),
      (snap) => {
        setPersonnel(snap.docs.map((d) => {
          const data = d.data();
          const sanitized: any = { id: d.id };
          for (const [key, val] of Object.entries(data)) {
            if (val && typeof val === "object" && "seconds" in val && "nanoseconds" in val) {
              sanitized[key] = new Date((val as any).seconds * 1000)
                .toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
            } else {
              sanitized[key] = val;
            }
          }
          return sanitized as Personnel;
        }));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return personnel.filter((p) => {
      if (activeRole !== "todos" && p.role !== activeRole) return false;
      if (filterStatus !== "todos" && p.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.fullName?.toLowerCase().includes(q) ||
          p.docNumber?.toLowerCase().includes(q) ||
          p.phone?.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [personnel, activeRole, filterStatus, search]);

  const counts = useMemo(() => ({
    todos:      personnel.filter((p) => p.status === "activo").length,
    vigilante:  personnel.filter((p) => p.role === "vigilante"  && p.status === "activo").length,
    descansero: personnel.filter((p) => p.role === "descansero" && p.status === "activo").length,
    supervisor: personnel.filter((p) => p.role === "supervisor" && p.status === "activo").length,
  }), [personnel]);

  async function loadAssignments(guardId: string) {
    setLoadingAsgs(true);
    try {
      const snap = await getDocs(query(
        collection(db, "assignments"),
        where("guardId", "==", guardId),
        where("status", "in", ["borrador", "publicado"]),
        orderBy("date", "desc")
      ));
      setAssignments(snap.docs.slice(0, 10).map((d) => {
        const r = d.data();
        return { id: d.id, ...r, date: r.date?.toDate?.() || new Date() } as Assignment;
      }));
    } finally { setLoadingAsgs(false); }
  }

  function openView(p: Personnel) {
    setSelected(p); setModal("view"); setShowPass(false); loadAssignments(p.id);
  }

  function openEdit(p: Personnel) {
    setSelected(p);
    setForm({
      docType:    (p.docType    || "DNI") as DocType,
      docNumber:  p.docNumber   || (p as any).cedula || "",
      fullName:   p.fullName    || "",
      phone:      p.phone       || "",
      address:    p.address     || "",
      birthDate:  p.birthDate   || "",
      age:        p.age         || "",
      photoURL:   p.photoURL    || "",
      bankAccount:p.bankAccount || "",
      bank:       p.bank        || "",
      role:       p.role        || "vigilante",
      authRole:   p.authRole    || "vigilante",
      status:     p.status      || "activo",
      startDate:  p.startDate   || "",
      category:   p.category    || "Sin categoría",
      preferredShift: p.preferredShift || "dia",
      canRotate:  p.canRotate   || false,
      enPlanilla: p.enPlanilla  ?? false,
      razonSocial:p.razonSocial || "",
      formaPago:  p.formaPago   || "",
      email:      p.email       || "",
      password:   p.password    || "",
    });
    setFormPassword(p.password || "");
    setShowFormPass(false);
    setFormError("");
    setModal("edit");
  }

  function openNew() {
    setSelected(null);
    setForm(EMPTY_FORM());
    setFormPassword("");
    setShowFormPass(false);
    setFormError("");
    setModal("new");
  }

  async function handleSave() {
    if (!form.fullName.trim())  { setFormError("El nombre completo es obligatorio."); return; }
    if (!form.docNumber.trim()) { setFormError(`El número de ${form.docType} es obligatorio.`); return; }
    if (modal === "new") {
      if (!form.email?.trim())  { setFormError("El correo electrónico es obligatorio."); return; }
      if (!formPassword || formPassword.length < 6) { setFormError("La contraseña debe tener al menos 6 caracteres."); return; }
    }

    setSaving(true);
    setFormError("");

    try {
      const data: any = {
        ...form,
        age: form.birthDate ? calcAge(form.birthDate) : (form.age ? Number(form.age) : null),
      };
      delete data.email;

      if (modal === "new") {
        const currentUser = auth.currentUser;
        if (!currentUser) { setFormError("Sesión expirada. Recarga la página."); setSaving(false); return; }
        const idToken = await currentUser.getIdToken();

        const res = await fetch("/api/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
          body: JSON.stringify({
            email: form.email,
            password: formPassword,
            personnelData: { ...data, password: formPassword },
          }),
        });

        const json = await res.json();
        if (!res.ok) { setFormError(json.error || "Error al crear el usuario."); setSaving(false); return; }

        setCreatedCreds({ email: form.email!, password: formPassword });
        setModal(null);

      } else if (selected) {
        // En edición también guardamos la contraseña actualizada si se cambió
        const updateData: any = { ...data, updatedAt: Timestamp.now() };
        if (formPassword) updateData.password = formPassword;
        await updateDoc(doc(db, "personnel", selected.id), updateData);
        setModal(null);
      }

      setSuccessMsg(modal === "new" ? "Perfil y usuario creados correctamente." : "Perfil actualizado.");
      setTimeout(() => setSuccessMsg(""), 4000);

    } catch (e: any) {
      setFormError("Error inesperado: " + (e.message || e.code || "desconocido"));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(p: Personnel) {
    const next: PersonStatus = p.status === "activo" ? "inactivo" : "activo";
    await updateDoc(doc(db, "personnel", p.id), { status: next, updatedAt: Timestamp.now() });
    setConfirmToggle(null);
    if (modal === "view") setSelected((prev) => prev ? { ...prev, status: next } : null);
  }

  function exportCSV() {
    const rows = [
      ["Nombre","Doc","Número","Teléfono","F. Nacimiento","Edad","Rol","Estado","Planilla","Razón Social","Forma Pago","Fecha inicio","Categoría","Banco","Cuenta","Email"],
      ...filtered.map((p) => [
        p.fullName, p.docType||"DNI", p.docNumber||(p as any).cedula||"",
        p.phone, p.birthDate||"", String(p.age||""),
        ROLE_CONFIG[p.role]?.label||p.role,
        STATUS_CONFIG[p.status]?.label||p.status,
        p.enPlanilla?"Sí":"No",
        p.razonSocial||"", p.formaPago||"",
        p.startDate||"", p.category||"",
        p.bank||"", p.bankAccount||"", p.email||"",
      ]),
    ];
    const csv  = rows.map((r) => r.map((c) => `"${(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `personal_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function setField(key: string, value: any) {
    setForm((prev: any) => {
      const next = { ...prev, [key]: value };
      if (key === "birthDate") next.age = calcAge(value);
      return next;
    });
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="pp">

        {/* Header */}
        <div className="pp-header">
          <div className="pp-header-left">
            <Link href="/dashboard" className="pp-back">← Dashboard</Link>
            <div>
              <p className="pp-eye">Gestión de recursos humanos</p>
              <h1 className="pp-title">Registro de <span>Personal</span></h1>
            </div>
          </div>
          <div className="pp-header-actions">
            <button className="btn-export" onClick={exportCSV}>↓ CSV</button>
            <button className="btn-new" onClick={openNew}>+ Nuevo perfil</button>
          </div>
        </div>

        {successMsg && <div className="toast-success">{successMsg}</div>}

        {/* Role tabs */}
        <div className="role-tabs">
          {([
            ["todos","👥","Total activos",counts.todos],
            ["vigilante","🛡","Vigilantes",counts.vigilante],
            ["descansero","🔄","Descanseros",counts.descansero],
            ["supervisor","⭐","Supervisores",counts.supervisor],
          ] as const).map(([role,icon,label,count]) => (
            <button key={role}
              className={"role-tab"+(activeRole===role?" role-tab-active":"")}
              onClick={() => setActiveRole(role)}
              style={activeRole===role&&role!=="todos"?{borderBottomColor:ROLE_CONFIG[role as Role]?.color,color:ROLE_CONFIG[role as Role]?.color}:{}}
            >
              <span className="role-tab-icon">{icon}</span>
              <span className="role-tab-label">{label}</span>
              <span className="role-tab-count">{count}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="search-bar">
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" type="text" placeholder="Nombre, documento, email…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="search-clear" onClick={() => setSearch("")}>✕</button>}
          </div>
          <div className="filter-chips">
            {(["todos","activo","inactivo","suspendido","reingreso"] as const).map((s) => (
              <button key={s}
                className={"chip"+(filterStatus===s?" chip-active":"")}
                onClick={() => setFilterStatus(s)}
                style={filterStatus===s&&s!=="todos"?{borderColor:STATUS_CONFIG[s]?.color,color:STATUS_CONFIG[s]?.color}:{}}
              >{s==="todos"?"Todos":STATUS_CONFIG[s].label}</button>
            ))}
          </div>
          <span className="result-count">{filtered.length} persona{filtered.length!==1?"s":""}</span>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="loading-state"><span className="spinner"/>Cargando personal…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👤</div>
            <p className="empty-title">Sin resultados</p>
            <p className="empty-sub">{search?`Sin coincidencias para "${search}".`:"No hay personal en esta categoría."}</p>
            <button className="btn-new" onClick={openNew}>+ Agregar primer perfil</button>
          </div>
        ) : (
          <div className="cards-grid">
            {filtered.map((p) => {
              const roleCfg   = ROLE_CONFIG[p.role]   || ROLE_CONFIG.vigilante;
              const statusCfg = STATUS_CONFIG[p.status]|| STATUS_CONFIG.activo;
              return (
                <div key={p.id}
                  className={"person-card"+(p.status!=="activo"?" card-inactive":"")}
                  onClick={() => openView(p)}
                >
                  <div className="card-avatar-wrap">
                    {p.photoURL
                      ? <img src={p.photoURL} alt={p.fullName} className="card-avatar-img"/>
                      : <div className="card-avatar-initials" style={{background:roleCfg.bg,color:roleCfg.color,borderColor:roleCfg.border}}>{getInitials(p.fullName)}</div>
                    }
                    <span className="card-status-dot" style={{background:statusCfg.color}} title={statusCfg.label}/>
                  </div>
                  <div className="card-info">
                    <p className="card-name">{p.fullName}</p>
                    <p className="card-cedula">{p.docType||"DNI"} {p.docNumber||(p as any).cedula}</p>
                    <div className="card-badges">
                      <span className="role-badge" style={{color:roleCfg.color,background:roleCfg.bg,borderColor:roleCfg.border}}>{roleCfg.icon} {roleCfg.label}</span>
                      {p.enPlanilla && <span className="planilla-badge">Planilla</span>}
                    </div>
                    <div className="card-meta">
                      {p.phone    && <span>📞 {p.phone}</span>}
                      {p.formaPago && <span>💰 {p.formaPago}</span>}
                    </div>
                  </div>
                  <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="card-btn-edit" title="Editar" onClick={() => openEdit(p)}>✎</button>
                    <button
                      className={"card-btn-toggle "+(p.status==="activo"?"btn-deactivate":"btn-activate")}
                      onClick={() => setConfirmToggle(p)}
                    >{p.status==="activo"?"⏸":"▶"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── MODAL VER ── */}
        {modal==="view" && selected && (
          <div className="overlay" onClick={(e) => { if(e.target===e.currentTarget) setModal(null); }}>
            <div className="modal modal-view">
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
              <div className="view-hero">
                {selected.photoURL
                  ? <img src={selected.photoURL} alt={selected.fullName} className="view-avatar"/>
                  : <div className="view-avatar view-avatar-initials" style={{background:ROLE_CONFIG[selected.role]?.bg,color:ROLE_CONFIG[selected.role]?.color,borderColor:ROLE_CONFIG[selected.role]?.border}}>{getInitials(selected.fullName)}</div>
                }
                <div className="view-hero-info">
                  <h2 className="view-name">{selected.fullName}</h2>
                  <p className="view-cedula">{selected.docType||"DNI"} {selected.docNumber||(selected as any).cedula}</p>
                  {selected.email && <p className="view-email">✉️ {selected.email}</p>}
                  <div className="view-badges">
                    <span className="role-badge" style={{color:ROLE_CONFIG[selected.role]?.color,background:ROLE_CONFIG[selected.role]?.bg,borderColor:ROLE_CONFIG[selected.role]?.border}}>{ROLE_CONFIG[selected.role]?.icon} {ROLE_CONFIG[selected.role]?.label}</span>
                    <span className="status-badge" style={{color:STATUS_CONFIG[selected.status]?.color,background:STATUS_CONFIG[selected.status]?.bg}}>{STATUS_CONFIG[selected.status]?.label}</span>
                    {selected.enPlanilla && <span className="planilla-badge">Planilla</span>}
                  </div>
                </div>
                <button className="btn-edit-profile" onClick={() => { setModal(null); openEdit(selected); }}>✎ Editar</button>
              </div>

              <div className="view-sections">
                {/* Datos personales */}
                <div className="view-section">
                  <p className="section-title">👤 Datos personales</p>
                  <div className="data-grid">
                    <DataItem label="Teléfono"      value={selected.phone||"—"}/>
                    <DataItem label="Edad"          value={selected.age?`${selected.age} años`:"—"}/>
                    <DataItem label="F. Nacimiento" value={selected.birthDate?new Date(selected.birthDate).toLocaleDateString("es-ES"):"—"}/>
                    <DataItem label="Dirección"     value={selected.address||"—"} colSpan/>
                  </div>
                </div>

                {/* Datos laborales */}
                <div className="view-section">
                  <p className="section-title">💼 Datos laborales</p>
                  <div className="data-grid">
                    <DataItem label="Fecha de inicio" value={selected.startDate||"—"}/>
                    <DataItem label="Categoría"       value={selected.category||"—"}/>
                    <DataItem label="Razón social"    value={selected.razonSocial||"—"}/>
                    <DataItem label="Forma de pago"   value={selected.formaPago||"—"}/>
                    <DataItem label="Turno preferido" value={selected.preferredShift==="dia"?"☀️ Día":selected.preferredShift==="noche"?"🌙 Noche":"☀️🌙 Ambos"}/>
                    <DataItem label="Puede rotar"     value={selected.canRotate?"Sí":"No"}/>
                  </div>
                </div>

                {/* Datos bancarios */}
                <div className="view-section">
                  <p className="section-title">🏦 Datos bancarios</p>
                  <div className="data-grid">
                    <DataItem label="Banco"  value={selected.bank||"—"}/>
                    <DataItem label="Cuenta" value={selected.bankAccount||"—"}/>
                  </div>
                </div>

                {/* Acceso al sistema */}
                <div className="view-section">
                  <p className="section-title">🔐 Acceso al sistema</p>
                  <div className="data-grid">
                    <DataItem label="Correo"        value={selected.email||"—"}/>
                    <DataItem label="Rol de acceso" value={selected.authRole||"—"}/>
                    <div className="data-item data-item-full">
                      <span className="data-lbl">Contraseña</span>
                      <div className="pass-view-row">
                        <span className="data-val pass-value">
                          {selected.password
                            ? (showPass ? selected.password : "••••••••")
                            : "—"
                          }
                        </span>
                        {selected.password && (
                          <button className="btn-show-pass" onClick={() => setShowPass(v => !v)}>
                            {showPass ? "🙈 Ocultar" : "👁 Ver"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Últimos turnos */}
                <div className="view-section">
                  <p className="section-title">📅 Últimos turnos</p>
                  {loadingAsgs
                    ? <div className="loading-inline"><span className="spinner-sm"/> Cargando…</div>
                    : assignments.length===0
                      ? <p className="no-asgs">Sin turnos asignados.</p>
                      : <div className="asgs-list">
                          {assignments.map((a) => (
                            <div key={a.id} className="asg-row">
                              <span className={"asg-shift shift-"+a.shift}>{a.shift==="dia"?"☀️ Día":a.shift==="noche"?"🌙 Noche":"💤 Descanso"}</span>
                              <span className="asg-unit">{a.unitName}</span>
                              <span className="asg-date">{a.date.toLocaleDateString("es-ES",{weekday:"short",day:"2-digit",month:"short"})}</span>
                              <span className={"asg-status "+(a.status==="publicado"?"pub":"draft")}>{a.status==="publicado"?"Publicado":"Borrador"}</span>
                            </div>
                          ))}
                        </div>
                  }
                </div>
              </div>

              <div className="view-footer">
                <button
                  className={"btn-toggle-status "+(selected.status==="activo"?"btn-deactivate-full":"btn-activate-full")}
                  onClick={() => setConfirmToggle(selected)}
                >{selected.status==="activo"?"⏸ Desactivar perfil":"▶ Activar perfil"}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL NUEVO / EDITAR ── */}
        {(modal==="new"||modal==="edit") && (
          <div className="overlay" onClick={(e) => { if(e.target===e.currentTarget) setModal(null); }}>
            <div className="modal modal-form">
              <div className="modal-handle"/>
              <div className="form-header">
                <h3 className="form-title">{modal==="new"?"Nuevo perfil":`Editar — ${selected?.fullName}`}</h3>
                <button className="modal-close" onClick={() => setModal(null)}>✕</button>
              </div>

              <div className="form-body">
                {/* Datos personales */}
                <p className="form-section-title">👤 Datos personales</p>
                <div className="form-grid">
                  <div className="form-field form-field-full">
                    <label>Nombre completo *</label>
                    <input type="text" placeholder="Ej: Juan Carlos Pérez"
                      value={form.fullName} onChange={(e) => setField("fullName",e.target.value)}/>
                  </div>
                  <div className="form-field">
                    <label>Tipo de documento *</label>
                    <div className="doc-type-row">
                      {(["DNI","CE"] as DocType[]).map((dt) => (
                        <button key={dt} type="button"
                          className={"doc-type-btn"+(form.docType===dt?" doc-type-active":"")}
                          onClick={() => setField("docType",dt)}>{dt}</button>
                      ))}
                    </div>
                  </div>
                  <div className="form-field">
                    <label>N° de {form.docType} *</label>
                    <input type="text" placeholder={form.docType==="DNI"?"12345678":"000123456"}
                      value={form.docNumber} onChange={(e) => setField("docNumber",e.target.value)}/>
                  </div>
                  <div className="form-field">
                    <label>Fecha de nacimiento</label>
                    <input type="date" value={form.birthDate} onChange={(e) => setField("birthDate",e.target.value)}/>
                  </div>
                  <div className="form-field">
                    <label>Edad (calculada)</label>
                    <input type="number" readOnly value={form.age!==""?form.age:""} placeholder="Se calcula sola" className="input-readonly"/>
                  </div>
                  <div className="form-field">
                    <label>Teléfono</label>
                    <input type="tel" placeholder="999 123 456" value={form.phone} onChange={(e) => setField("phone",e.target.value)}/>
                  </div>
                  <div className="form-field form-field-full">
                    <label>Dirección</label>
                    <input type="text" placeholder="Jr. Los Pinos 123, Lima" value={form.address} onChange={(e) => setField("address",e.target.value)}/>
                  </div>
                  <div className="form-field form-field-full">
                    <label>URL de foto (opcional)</label>
                    <input type="url" placeholder="https://…" value={form.photoURL} onChange={(e) => setField("photoURL",e.target.value)}/>
                  </div>
                </div>

                {/* Datos laborales */}
                <p className="form-section-title">💼 Datos laborales</p>
                <div className="form-grid">
                  <div className="form-field">
                    <label>Rol en operaciones *</label>
                    <select value={form.role} onChange={(e) => setField("role",e.target.value)}>
                      <option value="vigilante">🛡 Agente</option>
                      <option value="descansero">🔄 Descansero</option>
                      <option value="supervisor">⭐ Supervisor</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Rol en el sistema (acceso)</label>
                    <select value={form.authRole} onChange={(e) => setField("authRole",e.target.value)}>
                      <option value="vigilante">Agente</option>
                      <option value="coordinador">Coordinador</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Estado</label>
                    <select value={form.status} onChange={(e) => setField("status",e.target.value)}>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                      <option value="suspendido">Suspendido</option>
                      <option value="reingreso">Reingreso</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Fecha de inicio</label>
                    <input type="date" value={form.startDate} onChange={(e) => setField("startDate",e.target.value)}/>
                  </div>
                  <div className="form-field">
                    <label>Categoría</label>
                    <select value={form.category} onChange={(e) => setField("category",e.target.value)}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Turno preferido</label>
                    <select value={form.preferredShift} onChange={(e) => setField("preferredShift",e.target.value)}>
                      <option value="dia">☀️ Día</option>
                      <option value="noche">🌙 Noche</option>
                      <option value="ambos">☀️🌙 Ambos</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Razón social</label>
                    <select value={form.razonSocial} onChange={(e) => setField("razonSocial",e.target.value)}>
                      <option value="">— Seleccionar —</option>
                      <option value="CONSULTANS">CONSULTANS</option>
                      <option value="CONSULTANS/CENTRAL">CONSULTANS/CENTRAL</option>
                      <option value="CENTRAL">CENTRAL</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Forma de pago</label>
                    <select value={form.formaPago} onChange={(e) => setField("formaPago",e.target.value)}>
                      <option value="">— Seleccionar —</option>
                      <option value="PRIMER GRUPO">PRIMER GRUPO</option>
                      <option value="SEGUNDO GRUPO">SEGUNDO GRUPO</option>
                      <option value="TERCER GRUPO">TERCER GRUPO</option>
                      <option value="CUARTO GRUPO">CUARTO GRUPO</option>
                      <option value="OFICINA">OFICINA</option>
                    </select>
                  </div>
                  <div className="form-field form-field-checks">
                    <label className="check-label">
                      <input type="checkbox" checked={!!form.enPlanilla} onChange={(e) => setField("enPlanilla",e.target.checked)}/>
                      <span>En planilla</span>
                    </label>
                    <label className="check-label">
                      <input type="checkbox" checked={!!form.canRotate} onChange={(e) => setField("canRotate",e.target.checked)}/>
                      <span>Puede rotar turnos</span>
                    </label>
                  </div>
                </div>

                {/* Datos bancarios */}
                <p className="form-section-title">🏦 Datos bancarios</p>
                <div className="form-grid">
                  <div className="form-field">
                    <label>Banco</label>
                    <select value={form.bank} onChange={(e) => setField("bank",e.target.value)}>
                      <option value="">— Seleccionar —</option>
                      {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Número de cuenta</label>
                    <input type="text" placeholder="123-456789-0-12" value={form.bankAccount} onChange={(e) => setField("bankAccount",e.target.value)}/>
                  </div>
                </div>

                {/* Acceso al sistema */}
                <p className="form-section-title">🔐 Acceso al sistema</p>
                {modal==="new" && (
                  <div className="auth-notice">Al guardar se creará automáticamente el usuario en Firebase Auth.</div>
                )}
                <div className="form-grid">
                  <div className="form-field form-field-full">
                    <label>Correo electrónico {modal==="new"?"*":""}</label>
                    <input type="email" placeholder="juan@ejemplo.com"
                      value={form.email} onChange={(e) => setField("email",e.target.value)}/>
                  </div>
                  <div className="form-field form-field-full">
                    <label>{modal==="new"?"Contraseña inicial * (mín. 6 caracteres)":"Contraseña guardada"}</label>
                    <div className="pass-input-wrap">
                      <input
                        type={showFormPass?"text":"password"}
                        placeholder={modal==="new"?"Mín. 6 caracteres":"Contraseña actual"}
                        value={modal==="new"?formPassword:(form.password||"")}
                        onChange={(e) => modal==="new"?setFormPassword(e.target.value):setField("password",e.target.value)}
                      />
                      <button type="button" className="btn-toggle-pass" onClick={() => setShowFormPass(v=>!v)}>
                        {showFormPass?"🙈":"👁"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {formError && <p className="form-error">⚠ {formError}</p>}

              <div className="form-actions">
                <button className="btn-save" onClick={handleSave} disabled={saving}>
                  {saving?<><span className="spinner-sm"/> Guardando…</>:modal==="new"?"Crear perfil y usuario":"Guardar cambios"}
                </button>
                <button className="btn-cancel" onClick={() => setModal(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal credenciales */}
        {createdCreds && (
          <div className="overlay overlay-confirm">
            <div className="modal modal-confirm">
              <div className="confirm-icon">✅</div>
              <h3 className="confirm-title">Usuario creado</h3>
              <p className="confirm-body">Comparte estas credenciales con la persona:</p>
              <div className="creds-box">
                <div className="cred-row"><span className="cred-lbl">Correo</span><span className="cred-val">{createdCreds.email}</span></div>
                <div className="cred-row"><span className="cred-lbl">Contraseña</span><span className="cred-val cred-mono">{createdCreds.password}</span></div>
              </div>
              <p className="confirm-hint">Se recomienda que el usuario cambie su contraseña al ingresar.</p>
              <div className="confirm-actions">
                <button className="btn-confirm btn-confirm-green" onClick={() => setCreatedCreds(null)}>Entendido</button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm toggle */}
        {confirmToggle && (
          <div className="overlay overlay-confirm" onClick={(e) => { if(e.target===e.currentTarget) setConfirmToggle(null); }}>
            <div className="modal modal-confirm">
              <div className="confirm-icon">{confirmToggle.status==="activo"?"⏸":"▶"}</div>
              <h3 className="confirm-title">{confirmToggle.status==="activo"?"¿Desactivar perfil?":"¿Activar perfil?"}</h3>
              <p className="confirm-body">
                {confirmToggle.status==="activo"
                  ?`${confirmToggle.fullName} no aparecerá disponible para asignaciones.`
                  :`${confirmToggle.fullName} volverá a estar disponible.`}
              </p>
              <div className="confirm-actions">
                <button
                  className={"btn-confirm "+(confirmToggle.status==="activo"?"btn-confirm-red":"btn-confirm-green")}
                  onClick={() => handleToggleStatus(confirmToggle)}
                >{confirmToggle.status==="activo"?"Desactivar":"Activar"}</button>
                <button className="btn-cancel" onClick={() => setConfirmToggle(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

function DataItem({ label, value, colSpan }: { label: string; value: string; colSpan?: boolean }) {
  return (
    <div className={"data-item"+(colSpan?" data-item-full":"")}>
      <span className="data-lbl">{label}</span>
      <span className="data-val">{value}</span>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Montserrat:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--gold:#C9A84C;--gold-light:#E8C97A;--black:#0A0A0A;--card:#141414;--card2:#1c1c1c;--white:#F5F0E8;--dim:rgba(245,240,232,.5);--border:rgba(201,168,76,.18);--red:#E57373;--blue:#4DA3FF;--green:#81C784;}
.pp{background:var(--black);min-height:100vh;font-family:'Montserrat',sans-serif;color:var(--white);padding:20px 16px 60px}
.pp::before{content:'';position:fixed;inset:0;background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;z-index:0}
.pp>*{position:relative;z-index:1}
.pp-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.pp-header-left{display:flex;flex-direction:column;gap:8px}
.pp-back{font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--dim);text-decoration:none;transition:color .2s}
.pp-back:hover{color:var(--gold)}
.pp-eye{font-size:9px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:4px}
.pp-title{font-family:'Cormorant Garamond',serif;font-size:clamp(24px,6vw,40px);font-weight:300;line-height:1.1}
.pp-title span{color:var(--gold);font-style:italic;font-weight:600}
.pp-header-actions{display:flex;gap:8px;align-items:center;align-self:flex-end}
.toast-success{background:rgba(129,199,132,.1);border:1px solid rgba(129,199,132,.35);color:var(--green);font-size:11px;padding:10px 14px;margin-bottom:14px;animation:fadeIn .3s ease both}
@keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.role-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:20px}
.role-tab{background:var(--card);border:1px solid var(--border);border-bottom:2px solid transparent;padding:10px 8px;cursor:pointer;font-family:'Montserrat',sans-serif;color:var(--dim);display:flex;flex-direction:column;align-items:center;gap:3px;transition:color .2s,border-color .2s;text-align:center}
.role-tab:hover{color:var(--white)}
.role-tab-active{color:var(--gold);border-bottom-color:var(--gold);background:rgba(201,168,76,.04)}
.role-tab-icon{font-size:clamp(16px,4vw,22px)}
.role-tab-label{font-size:clamp(7px,1.5vw,9px);font-weight:600;letter-spacing:1px;text-transform:uppercase}
.role-tab-count{font-family:'Cormorant Garamond',serif;font-size:clamp(18px,4vw,28px);font-weight:300;line-height:1}
.search-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--card);border:1px solid var(--border);padding:12px 14px;margin-bottom:16px}
.search-input-wrap{display:flex;align-items:center;gap:8px;flex:1;min-width:160px}
.search-icon{font-size:13px;color:var(--dim);flex-shrink:0}
.search-input{flex:1;background:none;border:none;outline:none;color:var(--white);font-family:'Montserrat',sans-serif;font-size:12px}
.search-input::placeholder{color:var(--dim)}
.search-clear{background:none;border:none;color:var(--dim);cursor:pointer;font-size:11px;transition:color .15s}
.search-clear:hover{color:var(--red)}
.filter-chips{display:flex;gap:4px;flex-wrap:wrap}
.chip{padding:4px 10px;background:transparent;border:1px solid rgba(255,255,255,.12);color:var(--dim);font-family:'Montserrat',sans-serif;font-size:9px;font-weight:600;letter-spacing:.5px;cursor:pointer;transition:all .15s}
.chip:hover{border-color:rgba(255,255,255,.3);color:var(--white)}
.chip-active{border-color:var(--gold);color:var(--gold);background:rgba(201,168,76,.08)}
.result-count{font-size:9px;color:var(--dim);margin-left:auto;white-space:nowrap}
.cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.person-card{background:var(--card);border:1px solid var(--border);padding:14px;display:flex;align-items:flex-start;gap:12px;cursor:pointer;transition:border-color .2s,transform .15s;position:relative;overflow:hidden}
.person-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--gold);opacity:0;transition:opacity .2s}
.person-card:hover{border-color:rgba(201,168,76,.4);transform:translateY(-1px)}
.person-card:hover::before{opacity:1}
.card-inactive{opacity:.5}
.card-avatar-wrap{position:relative;flex-shrink:0}
.card-avatar-img{width:48px;height:48px;border-radius:2px;object-fit:cover;border:1px solid var(--border)}
.card-avatar-initials{width:48px;height:48px;border-radius:2px;border:1px solid;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600}
.card-status-dot{position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;border:2px solid var(--card)}
.card-info{flex:1;min-width:0}
.card-name{font-size:13px;font-weight:600;color:var(--white);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-cedula{font-size:9px;color:var(--dim);margin-bottom:6px}
.card-badges{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}
.role-badge{font-size:8px;font-weight:700;letter-spacing:.5px;padding:2px 7px;border:1px solid}
.planilla-badge{font-size:8px;font-weight:700;padding:2px 7px;border:1px solid rgba(129,199,132,.3);color:var(--green);background:rgba(129,199,132,.08);letter-spacing:.5px}
.status-badge{font-size:8px;font-weight:700;padding:2px 7px;border-radius:2px}
.card-meta{display:flex;flex-direction:column;gap:2px;font-size:9px;color:var(--dim)}
.card-actions{display:flex;flex-direction:column;gap:4px;flex-shrink:0}
.card-btn-edit{width:28px;height:28px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:var(--dim);cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;transition:all .15s}
.card-btn-edit:hover{border-color:var(--gold);color:var(--gold);background:rgba(201,168,76,.08)}
.card-btn-toggle{width:28px;height:28px;border:1px solid;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;transition:all .15s}
.btn-deactivate{background:rgba(229,115,115,.08);border-color:rgba(229,115,115,.3);color:var(--red)}
.btn-deactivate:hover{background:rgba(229,115,115,.15)}
.btn-activate{background:rgba(129,199,132,.08);border-color:rgba(129,199,132,.3);color:var(--green)}
.btn-activate:hover{background:rgba(129,199,132,.15)}
.loading-state,.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;gap:12px}
.empty-icon{font-size:48px;opacity:.2}
.empty-title{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:300;opacity:.5}
.empty-sub{font-size:11px;color:var(--dim);text-align:center;max-width:260px;line-height:1.5}
.spinner{width:24px;height:24px;border:2px solid rgba(201,168,76,.2);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite}
.spinner-sm{width:12px;height:12px;border:2px solid rgba(0,0,0,.2);border-top-color:var(--black);border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;z-index:10000}
.overlay-confirm{align-items:center}
.modal{background:#111118;border:1px solid rgba(201,168,76,.2);width:100%;position:relative;overflow-y:auto;animation:slideUp .25s ease both}
@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
.modal-handle{width:36px;height:4px;background:rgba(255,255,255,.12);border-radius:2px;margin:12px auto 0}
.modal-close{position:absolute;top:14px;right:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:var(--dim);width:28px;height:28px;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;transition:all .15s;z-index:2}
.modal-close:hover{border-color:var(--red);color:var(--red)}
.modal-view{max-height:90vh;border-radius:16px 16px 0 0;border-bottom:none;padding-bottom:20px}
.view-hero{display:flex;align-items:flex-start;gap:16px;padding:24px 20px 20px;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap}
.view-avatar{width:72px;height:72px;border-radius:4px;object-fit:cover;border:1px solid var(--border);flex-shrink:0}
.view-avatar-initials{display:flex;align-items:center;justify-content:center;border:1px solid;font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:600}
.view-hero-info{flex:1;min-width:0}
.view-name{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:400;color:var(--white);margin-bottom:2px}
.view-cedula{font-size:10px;color:var(--dim);margin-bottom:2px}
.view-email{font-size:10px;color:var(--dim);margin-bottom:8px}
.view-badges{display:flex;gap:6px;flex-wrap:wrap}
.btn-edit-profile{margin-left:auto;padding:7px 14px;background:transparent;border:1px solid var(--border);color:var(--gold);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:600;letter-spacing:1px;cursor:pointer;transition:background .2s;align-self:flex-start;white-space:nowrap;clip-path:polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)}
.btn-edit-profile:hover{background:rgba(201,168,76,.08)}
.view-sections{display:flex;flex-direction:column}
.view-section{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.05)}
.section-title{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
.data-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.data-item{display:flex;flex-direction:column;gap:3px}
.data-item-full{grid-column:1/-1}
.data-lbl{font-size:8px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--dim)}
.data-val{font-size:12px;color:var(--white)}
/* Fila de contraseña en ver perfil */
.pass-view-row{display:flex;align-items:center;gap:10px}
.pass-value{font-family:monospace;font-size:13px;letter-spacing:1px}
.btn-show-pass{padding:3px 10px;background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.25);color:var(--gold);font-family:'Montserrat',sans-serif;font-size:9px;font-weight:600;cursor:pointer;transition:background .15s;white-space:nowrap}
.btn-show-pass:hover{background:rgba(201,168,76,.16)}
/* Input contraseña en formulario */
.pass-input-wrap{position:relative;display:flex}
.pass-input-wrap input{flex:1;padding-right:44px}
.btn-toggle-pass{position:absolute;right:0;top:0;bottom:0;width:40px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-left:none;color:var(--dim);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:color .15s}
.btn-toggle-pass:hover{color:var(--gold)}
.loading-inline{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--dim);padding:8px 0}
.no-asgs{font-size:11px;color:var(--dim);font-style:italic;padding:8px 0}
.asgs-list{display:flex;flex-direction:column;gap:5px}
.asg-row{display:flex;align-items:center;gap:10px;padding:7px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);font-size:10px;flex-wrap:wrap}
.asg-shift{font-weight:600;flex-shrink:0}
.shift-dia{color:var(--gold)}.shift-noche{color:var(--blue)}.shift-descanso{color:#888}
.asg-unit{flex:1;color:var(--white);min-width:80px}
.asg-date{color:var(--dim);white-space:nowrap}
.asg-status{font-size:8px;font-weight:700;padding:2px 7px;border:1px solid;white-space:nowrap}
.asg-status.pub{color:var(--green);border-color:rgba(129,199,132,.3);background:rgba(129,199,132,.08)}
.asg-status.draft{color:var(--gold);border-color:rgba(201,168,76,.3);background:rgba(201,168,76,.08)}
.view-footer{padding:14px 20px}
.btn-toggle-status{width:100%;padding:11px;border:1px solid;background:transparent;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:background .2s;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)}
.btn-deactivate-full{border-color:rgba(229,115,115,.3);color:var(--red)}.btn-deactivate-full:hover{background:rgba(229,115,115,.08)}
.btn-activate-full{border-color:rgba(129,199,132,.3);color:var(--green)}.btn-activate-full:hover{background:rgba(129,199,132,.08)}
.modal-form{max-height:92vh;border-radius:16px 16px 0 0;border-bottom:none;display:flex;flex-direction:column}
.form-header{display:flex;align-items:center;justify-content:space-between;padding:20px 20px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0}
.form-title{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;color:var(--white)}
.form-body{overflow-y:auto;flex:1;padding:16px 20px;display:flex;flex-direction:column;gap:4px}
.form-section-title{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold);padding:14px 0 8px;border-top:1px solid rgba(255,255,255,.06);margin-top:6px}
.form-section-title:first-child{border-top:none;margin-top:0;padding-top:0}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.form-field{display:flex;flex-direction:column;gap:5px}
.form-field-full{grid-column:1/-1}
.form-field-checks{grid-column:1/-1;display:flex;gap:20px;align-items:center;padding:4px 0}
.form-field label{font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--dim)}
.form-field input,.form-field select{padding:10px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:var(--white);font-family:'Montserrat',sans-serif;font-size:12px;outline:none;transition:border-color .15s}
.form-field input:focus,.form-field select:focus{border-color:var(--gold)}
.form-field input::placeholder{color:var(--dim)}
.form-field select option{background:#fff;color:#000}
.input-readonly{opacity:.55;cursor:not-allowed;background:rgba(255,255,255,.02)!important}
.doc-type-row{display:flex;gap:6px}
.doc-type-btn{flex:1;padding:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:var(--dim);font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;cursor:pointer;transition:all .15s}
.doc-type-btn:hover{border-color:rgba(201,168,76,.4);color:var(--white)}
.doc-type-active{border-color:var(--gold)!important;color:var(--gold)!important;background:rgba(201,168,76,.1)!important}
.check-label{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:var(--dim)}
.check-label input[type="checkbox"]{accent-color:var(--gold);width:14px;height:14px;cursor:pointer}
.auth-notice{background:rgba(77,163,255,.07);border:1px solid rgba(77,163,255,.2);color:rgba(77,163,255,.9);font-size:10px;padding:10px 12px;line-height:1.5;margin-bottom:4px}
.form-error{margin:0 20px;padding:10px 12px;background:rgba(229,115,115,.1);border:1px solid rgba(229,115,115,.3);color:var(--red);font-size:11px;flex-shrink:0}
.form-actions{display:flex;gap:8px;padding:14px 20px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0}
.btn-save{flex:1;padding:13px;background:var(--gold);color:var(--black);border:none;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:opacity .2s;display:flex;align-items:center;justify-content:center;gap:8px;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)}
.btn-save:disabled{opacity:.5;cursor:not-allowed}
.btn-save:not(:disabled):hover{opacity:.85}
.btn-cancel{flex:1;padding:13px;background:transparent;color:var(--dim);border:1px solid var(--border);font-family:'Montserrat',sans-serif;font-size:11px;cursor:pointer;transition:border-color .2s;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)}
.btn-cancel:hover{border-color:var(--gold);color:var(--white)}
.btn-new{padding:9px 16px;background:var(--gold);color:var(--black);border:none;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:opacity .2s;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)}
.btn-new:hover{opacity:.85}
.btn-export{padding:9px 14px;background:transparent;border:1px solid var(--border);color:var(--gold);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:background .2s;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)}
.btn-export:hover{background:rgba(201,168,76,.08)}
.modal-confirm{max-width:360px;border-radius:8px;padding:32px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;animation:fadeIn .2s ease both}
.confirm-icon{font-size:36px}
.confirm-title{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:400;color:var(--white)}
.confirm-body{font-size:11px;color:var(--dim);line-height:1.6}
.confirm-hint{font-size:10px;color:var(--dim);font-style:italic}
.confirm-actions{display:flex;gap:8px;width:100%;margin-top:4px}
.btn-confirm{flex:1;padding:11px;border:1px solid;background:transparent;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:background .2s}
.btn-confirm-red{border-color:rgba(229,115,115,.4);color:var(--red)}.btn-confirm-red:hover{background:rgba(229,115,115,.1)}
.btn-confirm-green{border-color:rgba(129,199,132,.4);color:var(--green)}.btn-confirm-green:hover{background:rgba(129,199,132,.1)}
.creds-box{background:rgba(255,255,255,.04);border:1px solid rgba(201,168,76,.2);padding:14px 16px;width:100%;display:flex;flex-direction:column;gap:8px;text-align:left}
.cred-row{display:flex;justify-content:space-between;align-items:center;gap:10px}
.cred-lbl{font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--dim);flex-shrink:0}
.cred-val{font-size:12px;color:var(--white);word-break:break-all}
.cred-mono{font-family:monospace;font-size:14px;color:var(--gold);font-weight:700}
@media(min-width:768px){
  .pp{padding:36px 32px 48px}
  .overlay{align-items:center}
  .modal-view,.modal-form{max-width:520px;border-radius:4px;border-bottom:1px solid rgba(201,168,76,.2);max-height:85vh;animation:fadeIn .2s ease both}
  .modal-handle{display:none}
  .data-grid{grid-template-columns:repeat(3,1fr)}
  .cards-grid{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
}
`;