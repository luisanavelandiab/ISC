/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  collection, onSnapshot, query, orderBy, where,
  doc, updateDoc, Timestamp, getDocs,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import Link from "next/link";

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type ActionType = "assign" | "delete" | "publish" | "unpublish";

interface ChangeLog {
  id: string;
  action: ActionType;
  adminId: string;
  timestamp: Date;
  notes?: string;
  // assign / delete
  assignmentId?: string;
  unitId?: string;
  unitName?: string;
  guardId?: string;
  guardName?: string;
  date?: Date;
  shift?: "dia" | "noche" | "descanso";
  // publish / unpublish
  weekStart?: Date;
  weekEnd?: Date;
  affectedCount?: number;
  affectedAssignments?: string[];
}

interface PublishLog {
  id: string;
  action: "publish" | "unpublish";
  adminId: string;
  timestamp: Date;
  weekStart: Date;
  weekEnd: Date;
  affectedCount: number;
  notes?: string;
}

const ACTION_CONFIG: Record<ActionType, { label: string; color: string; bg: string; icon: string }> = {
  assign:    { label: "Asignación",    color: "#C9A84C", bg: "rgba(201,168,76,.1)",   icon: "+" },
  delete:    { label: "Eliminación",   color: "#E57373", bg: "rgba(229,115,115,.1)",  icon: "✕" },
  publish:   { label: "Publicación",   color: "#81C784", bg: "rgba(129,199,132,.1)",  icon: "↑" },
  unpublish: { label: "Despublicado",  color: "#4DA3FF", bg: "rgba(77,163,255,.1)",   icon: "↓" },
};

const SHIFT_LABEL: Record<string, string> = {
  dia:      "☀️ Día",
  noche:    "🌙 Noche",
  descanso: "💤 Descanso",
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(d: Date) {
  return d.toLocaleString("es-ES", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
function fmtWeek(start: Date, end: Date) {
  return (
    start.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) +
    " — " +
    end.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
  );
}
function timeAgo(date: Date) {
  const diff = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return "ahora";
  if (mins < 60)  return `hace ${mins}m`;
  if (hours < 24) return `hace ${hours}h`;
  if (days < 30)  return `hace ${days}d`;
  return fmtDate(date);
}

// ─────────────────────────────────────────────
// COMPONENTE: NotesEditor
// ─────────────────────────────────────────────
function NotesEditor({
  logId,
  initialNote,
  onSaved,
}: {
  logId: string;
  initialNote?: string;
  onSaved?: (note: string) => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [text,    setText]      = useState(initialNote || "");
  const [saving,  setSaving]    = useState(false);
  const [saved,   setSaved]     = useState(false);
  const textareaRef             = useRef<HTMLTextAreaElement>(null);

  // Sync if prop changes (e.g. live Firestore update)
  useEffect(() => { setText(initialNote || ""); }, [initialNote]);

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(true);
    setSaved(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  async function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    setSaving(true);
    try {
      await updateDoc(doc(db, "changeLog", logId), { notes: text.trim() });
      setSaved(true);
      setEditing(false);
      onSaved?.(text.trim());
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error guardando nota:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel(e: React.MouseEvent) {
    e.stopPropagation();
    setText(initialNote || "");
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setText(initialNote || ""); setEditing(false); }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSave(e as any);
  }

  const hasNote = !!(text.trim());

  if (!editing) {
    return (
      <div className="notes-display" onClick={(e) => e.stopPropagation()}>
        {hasNote ? (
          <div className="notes-bubble">
            <span className="notes-dot notes-dot-filled" />
            <span className="notes-text">{text}</span>
            <button className="notes-edit-btn" onClick={handleEdit} title="Editar observación">
              ✎
            </button>
          </div>
        ) : (
          <button className="notes-add-btn" onClick={handleEdit} title="Agregar observación">
            <span className="notes-dot" />
            <span>+ Observación</span>
          </button>
        )}
        {saved && <span className="notes-saved-flash">✓ Guardado</span>}
      </div>
    );
  }

  return (
    <div className="notes-editor" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={textareaRef}
        className="notes-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escribe una observación sobre este registro…"
        rows={3}
        maxLength={500}
      />
      <div className="notes-actions">
        <span className="notes-hint">Ctrl+Enter para guardar · Esc para cancelar</span>
        <div className="notes-btns">
          <button className="notes-btn-cancel" onClick={handleCancel} disabled={saving}>
            Cancelar
          </button>
          <button className="notes-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? <span className="notes-spinner" /> : "✓ Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
export default function HistorialPage() {
  const [logs,        setLogs]        = useState<ChangeLog[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<"cambios" | "publicaciones">("cambios");
  const [filterAction, setFilterAction] = useState<ActionType | "todas">("todas");
  const [filterUnit,  setFilterUnit]  = useState("todas");
  const [filterGuard, setFilterGuard] = useState("todas");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [unpublishing, setUnpublishing] = useState<string | null>(null);

  // ── Firestore listener ──
  useEffect(() => {
    const q = query(collection(db, "changeLog"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data: ChangeLog[] = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          ...raw,
          timestamp:  raw.timestamp?.toDate?.()  || new Date(),
          date:       raw.date?.toDate?.(),
          weekStart:  raw.weekStart?.toDate?.(),
          weekEnd:    raw.weekEnd?.toDate?.(),
        } as ChangeLog;
      });
      setLogs(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Listas únicas para filtros ──
  const units = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((l) => { if (l.unitId && l.unitName) map.set(l.unitId, l.unitName); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [logs]);

  const guards = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((l) => { if (l.guardId && l.guardName) map.set(l.guardId, l.guardName); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [logs]);

  // ── Filtrado ──
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (filterAction !== "todas" && l.action !== filterAction) return false;
      if (filterUnit  !== "todas" && l.unitId  !== filterUnit)  return false;
      if (filterGuard !== "todas" && l.guardId !== filterGuard) return false;
      if (dateFrom && l.timestamp < new Date(dateFrom)) return false;
      if (dateTo   && l.timestamp > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [logs, filterAction, filterUnit, filterGuard, dateFrom, dateTo]);

  const changeLogs  = filteredLogs.filter((l) => l.action === "assign" || l.action === "delete");
  const publishLogs = filteredLogs.filter((l) => l.action === "publish" || l.action === "unpublish") as unknown as PublishLog[];

  // KPIs
  const totalAssigns = logs.filter((l) => l.action === "assign").length;
  const totalDeletes = logs.filter((l) => l.action === "delete").length;
  const totalPublish = logs.filter((l) => l.action === "publish").length;
  const lastPublish  = logs.find((l) => l.action === "publish");

  // ── Despublicar ──
  async function handleUnpublish(log: PublishLog) {
    if (!log.weekStart || !log.weekEnd) return;
    setUnpublishing(log.id);
    try {
      const q = query(
        collection(db, "assignments"),
        where("status", "==", "publicado")
      );
      const snap = await getDocs(q);
      const batch: Promise<void>[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const date = data.date?.toDate?.();
        if (date && date >= log.weekStart && date <= log.weekEnd) {
          batch.push(updateDoc(doc(db, "assignments", d.id), { status: "borrador", publishedAt: null }));
        }
      });
      await Promise.all(batch);
    } finally {
      setUnpublishing(null);
    }
  }

  // ── Exportar CSV ──
  function exportCSV() {
    const rows = [
      ["Acción", "Unidad", "Vigilante", "Turno", "Fecha Turno", "Registrado", "Admin", "Observación"],
      ...changeLogs.map((l) => [
        ACTION_CONFIG[l.action]?.label || l.action,
        l.unitName  || "",
        l.guardName || "",
        l.shift ? SHIFT_LABEL[l.shift] || l.shift : "",
        l.date ? fmtDate(l.date) : "",
        fmtDateTime(l.timestamp),
        l.adminId || "admin",
        l.notes || "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `historial_cambios_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="hp">

        {/* ── Header ── */}
        <div className="hp-header">
          <Link href="/coordinador" className="hp-back">← Dashboard</Link>
          <div>
            <p className="hp-eye">Registro de actividad</p>
            <h1 className="hp-title">Historial de <span>Cambios</span></h1>
          </div>
          <button className="btn-export" onClick={exportCSV} title="Exportar cambios a CSV">
            ↓ Exportar CSV
          </button>
        </div>

        {/* ── KPIs ── */}
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-icon" style={{ color: "#C9A84C" }}>+</div>
            <div className="kpi-info">
              <div className="kpi-lbl">Asignaciones</div>
              <div className="kpi-val">{totalAssigns}</div>
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ color: "#E57373" }}>✕</div>
            <div className="kpi-info">
              <div className="kpi-lbl">Eliminaciones</div>
              <div className="kpi-val">{totalDeletes}</div>
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ color: "#81C784" }}>↑</div>
            <div className="kpi-info">
              <div className="kpi-lbl">Publicaciones</div>
              <div className="kpi-val">{totalPublish}</div>
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ color: "#4DA3FF" }}>🕐</div>
            <div className="kpi-info">
              <div className="kpi-lbl">Última publicación</div>
              <div className="kpi-val kpi-val-sm">
                {lastPublish ? timeAgo(lastPublish.timestamp) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="tab-row">
          <button
            className={"tab-btn" + (tab === "cambios" ? " active" : "")}
            onClick={() => setTab("cambios")}
          >
            📝 Cambios de calendario
            <span className="tab-count">{changeLogs.length}</span>
          </button>
          <button
            className={"tab-btn" + (tab === "publicaciones" ? " active" : "")}
            onClick={() => setTab("publicaciones")}
          >
            ↑ Publicaciones
            <span className="tab-count">{publishLogs.length}</span>
          </button>
        </div>

        {/* ══════════════════════════════════════
            TAB: CAMBIOS DE CALENDARIO
        ══════════════════════════════════════ */}
        {tab === "cambios" && (
          <div className="panel">

            {/* ── Filtros ── */}
            <div className="filter-panel">
              <div className="filter-row">
                <div className="filter-group">
                  <span className="filter-lbl">Acción</span>
                  <div className="filter-chips">
                    {(["todas", "assign", "delete"] as const).map((a) => (
                      <button
                        key={a}
                        className={"chip" + (filterAction === a ? " chip-active" : "")}
                        onClick={() => setFilterAction(a)}
                        style={
                          filterAction === a && a !== "todas"
                            ? { borderColor: ACTION_CONFIG[a]?.color, color: ACTION_CONFIG[a]?.color }
                            : {}
                        }
                      >
                        {a === "todas" ? "Todas" : ACTION_CONFIG[a]?.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="filter-group">
                  <span className="filter-lbl">Unidad</span>
                  <select className="filter-select" value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
                    <option value="todas">Todas</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>

                <div className="filter-group">
                  <span className="filter-lbl">Agente</span>
                  <select className="filter-select" value={filterGuard} onChange={(e) => setFilterGuard(e.target.value)}>
                    <option value="todas">Todos</option>
                    {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="filter-row">
                <div className="filter-group">
                  <span className="filter-lbl">Desde</span>
                  <input type="date" className="filter-date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="filter-group">
                  <span className="filter-lbl">Hasta</span>
                  <input type="date" className="filter-date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                {(filterAction !== "todas" || filterUnit !== "todas" || filterGuard !== "todas" || dateFrom || dateTo) && (
                  <button className="btn-clear" onClick={() => { setFilterAction("todas"); setFilterUnit("todas"); setFilterGuard("todas"); setDateFrom(""); setDateTo(""); }}>
                    ✕ Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            {/* ── Resultado filtros ── */}
            <div className="result-bar">
              <span className="result-count">
                {changeLogs.length} registro{changeLogs.length !== 1 ? "s" : ""}
                {filteredLogs.length !== logs.length && " (filtrados)"}
              </span>
              <span className="result-hint">
                💬 Haz clic en una fila para ver detalles y agregar observaciones
              </span>
            </div>

            {/* ── Tabla / Lista ── */}
            {loading ? (
              <div className="loading-state">
                <span className="loading-spinner" />
                <span>Cargando historial…</span>
              </div>
            ) : changeLogs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <p className="empty-title">Sin registros</p>
                <p className="empty-sub">No hay cambios que coincidan con los filtros seleccionados.</p>
              </div>
            ) : (
              <>
                {/* Desktop: tabla */}
                <div className="tbl-scroll">
                  <table className="hist-table">
                    <thead>
                      <tr>
                        <th>Acción</th>
                        <th>Unidad</th>
                        <th>Agente</th>
                        <th>Turno</th>
                        <th>Fecha del turno</th>
                        <th>Registrado</th>
                        <th>Admin</th>
                        <th>Observación</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {changeLogs.map((log) => {
                        const cfg = ACTION_CONFIG[log.action];
                        const isExp = expandedId === log.id;
                        return (
                          <React.Fragment key={log.id}>
                            <tr
                              className={"tbl-row" + (isExp ? " tbl-row-expanded" : "")}
                              onClick={() => setExpandedId(isExp ? null : log.id)}
                            >
                              <td>
                                <span className="action-badge" style={{ color: cfg.color, borderColor: cfg.color, background: cfg.bg }}>
                                  <span className="action-icon">{cfg.icon}</span>
                                  {cfg.label}
                                </span>
                              </td>
                              <td className="tbl-unit">{log.unitName || <span className="tbl-dim">—</span>}</td>
                              <td className="tbl-guard">{log.guardName || <span className="tbl-dim">—</span>}</td>
                              <td>
                                {log.shift ? (
                                  <span className={"shift-badge shift-" + log.shift}>{SHIFT_LABEL[log.shift]}</span>
                                ) : <span className="tbl-dim">—</span>}
                              </td>
                              <td className="tbl-dim">{log.date ? fmtDate(log.date) : "—"}</td>
                              <td className="tbl-time">
                                <span className="tbl-time-ago">{timeAgo(log.timestamp)}</span>
                                <span className="tbl-time-full">{fmtDateTime(log.timestamp)}</span>
                              </td>
                              <td><span className="tbl-admin">{log.adminId || "admin"}</span></td>
                              {/* ── Columna Observación (inline, no expande fila) ── */}
                              <td className="tbl-notes-cell">
                                <NotesEditor logId={log.id} initialNote={log.notes} />
                              </td>
                              <td>
                                <button className="btn-row-expand">{isExp ? "▲" : "▼"}</button>
                              </td>
                            </tr>
                            {isExp && (
                              <tr className="tbl-detail-row">
                                <td colSpan={9}>
                                  <div className="tbl-detail">
                                    <div className="detail-grid">
                                      <div className="detail-item">
                                        <span className="detail-lbl">ID asignación</span>
                                        <span className="detail-val detail-mono">{log.assignmentId || "—"}</span>
                                      </div>
                                      <div className="detail-item">
                                        <span className="detail-lbl">Fecha exacta</span>
                                        <span className="detail-val">{fmtDateTime(log.timestamp)}</span>
                                      </div>
                                      <div className="detail-item">
                                        <span className="detail-lbl">Unidad ID</span>
                                        <span className="detail-val detail-mono">{log.unitId || "—"}</span>
                                      </div>
                                      <div className="detail-item">
                                        <span className="detail-lbl">Agente ID</span>
                                        <span className="detail-val detail-mono">{log.guardId || "—"}</span>
                                      </div>
                                    </div>
                                    {/* ── Sección observación expandida ── */}
                                    <div className="detail-notes-section">
                                      <span className="detail-lbl">💬 Observación del registro</span>
                                      <NotesEditor logId={log.id} initialNote={log.notes} />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Móvil: cards */}
                <div className="mobile-list">
                  {changeLogs.map((log) => {
                    const cfg = ACTION_CONFIG[log.action];
                    return (
                      <div key={log.id} className="mobile-card" style={{ borderLeftColor: cfg.color }}>
                        <div className="mc-top">
                          <span className="action-badge" style={{ color: cfg.color, borderColor: cfg.color, background: cfg.bg }}>
                            <span className="action-icon">{cfg.icon}</span>
                            {cfg.label}
                          </span>
                          <span className="mc-time">{timeAgo(log.timestamp)}</span>
                        </div>
                        <div className="mc-body">
                          {log.guardName && (
                            <div className="mc-row">
                              <span className="mc-lbl">👤</span>
                              <span className="mc-val">{log.guardName}</span>
                            </div>
                          )}
                          {log.unitName && (
                            <div className="mc-row">
                              <span className="mc-lbl">📍</span>
                              <span className="mc-val">{log.unitName}</span>
                            </div>
                          )}
                          {log.shift && (
                            <div className="mc-row">
                              <span className="mc-lbl">🕐</span>
                              <span className={"mc-val shift-badge shift-" + log.shift}>{SHIFT_LABEL[log.shift]}</span>
                            </div>
                          )}
                          {log.date && (
                            <div className="mc-row">
                              <span className="mc-lbl">📅</span>
                              <span className="mc-val">{fmtDate(log.date)}</span>
                            </div>
                          )}
                        </div>
                        {/* ── Observación en card móvil ── */}
                        <div className="mc-notes">
                          <NotesEditor logId={log.id} initialNote={log.notes} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: PUBLICACIONES
        ══════════════════════════════════════ */}
        {tab === "publicaciones" && (
          <div className="panel">
            <p className="panel-desc">
              Registro de cada vez que se usó el botón Publicar cambios en el dashboard.
              Desde aquí puedes despublicar una semana para regresarla a borrador.
            </p>

            {publishLogs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">↑</div>
                <p className="empty-title">Sin publicaciones aún</p>
                <p className="empty-sub">
                  Cada vez que publiques cambios desde el dashboard, aparecerá un registro aquí.
                </p>
              </div>
            ) : (
              <div className="pub-list">
                {publishLogs.map((log) => {
                  const cfg = ACTION_CONFIG[log.action];
                  const isUnpub = log.action === "unpublish";
                  return (
                    <div key={log.id} className={"pub-card" + (isUnpub ? " pub-card-unpub" : "")} style={{ borderLeftColor: cfg.color }}>
                      <div className="pub-main">
                        <div className="pub-left">
                          <div className="pub-icon" style={{ color: cfg.color, background: cfg.bg }}>{cfg.icon}</div>
                          <div className="pub-info">
                            <div className="pub-title-row">
                              <span className="pub-title">{isUnpub ? "Semana despublicada" : "Semana publicada"}</span>
                              <span className="pub-week">📅 {log.weekStart && log.weekEnd ? fmtWeek(log.weekStart, log.weekEnd) : "—"}</span>
                            </div>
                            <div className="pub-meta">
                              <span className="pub-count">{log.affectedCount} asignaci{log.affectedCount !== 1 ? "ones" : "ón"}</span>
                              <span className="pub-sep">·</span>
                              <span className="pub-time">{fmtDateTime(log.timestamp)}</span>
                              <span className="pub-sep">·</span>
                              <span className="pub-admin">Admin: {log.adminId || "admin"}</span>
                            </div>
                          </div>
                        </div>

                        {!isUnpub ? (
                          <button
                            className="btn-unpublish"
                            onClick={() => handleUnpublish(log)}
                            disabled={unpublishing === log.id}
                            title="Regresa estas asignaciones a borrador"
                          >
                            {unpublishing === log.id ? <span className="pub-spinner" /> : "↓ Despublicar"}
                          </button>
                        ) : (
                          <span className="pub-reverted-badge">Revertido</span>
                        )}
                      </div>

                      {/* ── Observación en pub-card ── */}
                      <div className="pub-notes">
                        <NotesEditor logId={log.id} initialNote={log.notes} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --gold: #C9A84C; --gold-light: #E8C97A;
  --black: #0A0A0A; --card: #141414; --card2: #1c1c1c;
  --white: #F5F0E8; --dim: rgba(245,240,232,.5);
  --border: rgba(201,168,76,.18);
  --red: #E57373; --blue: #4DA3FF; --green: #81C784;
}
.hp {
  background: var(--black); min-height: 100vh;
  font-family: 'Montserrat', sans-serif; color: var(--white);
  padding: 20px 16px 60px;
}
.hp::before {
  content: ''; position: fixed; inset: 0;
  background-image:
    linear-gradient(45deg,  rgba(201,168,76,.03) 1px, transparent 1px),
    linear-gradient(-45deg, rgba(201,168,76,.03) 1px, transparent 1px);
  background-size: 48px 48px; pointer-events: none; z-index: 0;
}
.hp > * { position: relative; z-index: 1; }

/* Header */
.hp-header {
  display: flex; align-items: flex-start; gap: 16px;
  margin-bottom: 20px; flex-wrap: wrap;
}
.hp-back {
  font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;
  color: var(--dim); text-decoration: none; padding: 6px 0;
  transition: color .2s; white-space: nowrap; align-self: center;
}
.hp-back:hover { color: var(--gold); }
.hp-eye  { font-size: 9px; font-weight: 600; letter-spacing: 4px; text-transform: uppercase; color: var(--gold); margin-bottom: 4px; }
.hp-title { font-family: 'Cormorant Garamond', serif; font-size: clamp(22px,6vw,38px); font-weight: 300; color: var(--white); line-height: 1.1; }
.hp-title span { color: var(--gold); font-style: italic; font-weight: 600; }
.btn-export {
  margin-left: auto; align-self: center;
  padding: 8px 16px; background: transparent;
  border: 1px solid var(--border); color: var(--gold);
  font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 600;
  letter-spacing: 1px; text-transform: uppercase; cursor: pointer;
  transition: background .2s; white-space: nowrap;
  clip-path: polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);
}
.btn-export:hover { background: rgba(201,168,76,.08); }

/* KPIs */
.kpi-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; margin-bottom: 24px; }
.kpi {
  background: var(--card); border: 1px solid var(--border);
  padding: clamp(8px,2vw,16px); display: flex; align-items: center; gap: 10px;
  clip-path: polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);
}
.kpi-icon { font-size: clamp(16px,4vw,24px); font-weight: 700; flex-shrink: 0; font-family: 'Cormorant Garamond', serif; }
.kpi-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.kpi-lbl  { font-size: clamp(6px,1.5vw,9px); font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--gold); }
.kpi-val  { font-family: 'Cormorant Garamond', serif; font-size: clamp(22px,5vw,36px); font-weight: 300; line-height: 1; }
.kpi-val-sm { font-size: clamp(14px,3vw,20px); }

/* Tabs */
.tab-row {
  display: flex; gap: 2px; margin-bottom: 20px;
  border-bottom: 1px solid var(--border);
}
.tab-btn {
  flex: 1; padding: 10px 6px; background: none; border: none;
  color: var(--dim); font-family: 'Montserrat',sans-serif;
  font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;
  cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color .2s; display: flex; align-items: center; justify-content: center; gap: 6px;
}
.tab-btn.active { color: var(--gold); border-bottom-color: var(--gold); }
.tab-count {
  background: rgba(201,168,76,.15); color: var(--gold);
  font-size: 8px; font-weight: 700; padding: 1px 6px; border-radius: 8px;
}

/* Panel */
.panel { display: flex; flex-direction: column; gap: 14px; }
.panel-desc { font-size: 11px; color: var(--dim); line-height: 1.6; }

/* Filter panel */
.filter-panel {
  background: var(--card); border: 1px solid var(--border);
  padding: 14px; display: flex; flex-direction: column; gap: 12px;
}
.filter-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.filter-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-lbl { font-size: 9px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); white-space: nowrap; }
.filter-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.chip {
  padding: 4px 10px; background: transparent;
  border: 1px solid rgba(255,255,255,.12); color: var(--dim);
  font-family: 'Montserrat',sans-serif; font-size: 9px; font-weight: 600; letter-spacing: .5px;
  cursor: pointer; transition: all .15s;
}
.chip:hover { border-color: rgba(255,255,255,.3); color: var(--white); }
.chip-active { border-color: var(--gold); color: var(--gold); background: rgba(201,168,76,.08); }
.filter-select {
  padding: 5px 10px; background: var(--card2); border: 1px solid var(--border);
  color: var(--white); font-family: 'Montserrat',sans-serif; font-size: 10px;
  outline: none; cursor: pointer; max-width: 160px;
}
.filter-select:focus { border-color: var(--gold); }
.filter-date {
  padding: 5px 10px; background: var(--card2); border: 1px solid var(--border);
  color: var(--white); font-family: 'Montserrat',sans-serif; font-size: 10px; outline: none;
  cursor: pointer; color-scheme: dark;
}
.filter-date:focus { border-color: var(--gold); }
.btn-clear {
  padding: 5px 12px; background: transparent;
  border: 1px solid rgba(229,115,115,.3); color: var(--red);
  font-family: 'Montserrat',sans-serif; font-size: 9px; font-weight: 600;
  letter-spacing: .5px; cursor: pointer; transition: background .15s;
}
.btn-clear:hover { background: rgba(229,115,115,.08); }

/* Result bar */
.result-bar {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;
  padding: 0 2px;
}
.result-count { font-size: 10px; color: var(--dim); letter-spacing: .5px; }
.result-hint  { font-size: 9px; color: rgba(201,168,76,.4); letter-spacing: .3px; }

/* Table */
.tbl-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); background: var(--card); }
.hist-table { width: 100%; border-collapse: collapse; min-width: 820px; }
.hist-table thead th {
  background: rgba(201,168,76,.08); padding: 11px 12px;
  text-align: left; font-size: 8px; font-weight: 700; letter-spacing: 1.5px;
  text-transform: uppercase; color: var(--gold); border-bottom: 1px solid var(--border);
  white-space: nowrap; position: sticky; top: 0;
}
.hist-table tbody .tbl-row td {
  padding: 11px 12px; border-bottom: 1px solid rgba(255,255,255,.04);
  vertical-align: middle; cursor: pointer; transition: background .12s;
  font-size: 11px;
}
.hist-table tbody .tbl-row:hover td { background: rgba(201,168,76,.03); }
.tbl-row-expanded td { background: rgba(201,168,76,.04) !important; }
.tbl-detail-row td { padding: 0; border-bottom: 1px solid rgba(255,255,255,.06); }
.tbl-detail { padding: 14px 16px 18px; background: rgba(0,0,0,.2); display: flex; flex-direction: column; gap: 14px; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px,1fr)); gap: 12px; }
.detail-item { display: flex; flex-direction: column; gap: 3px; }
.detail-lbl { font-size: 8px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); }
.detail-val { font-size: 11px; color: var(--white); }
.detail-mono { font-family: monospace; font-size: 10px; color: var(--dim); word-break: break-all; }

/* Notes section inside expanded row */
.detail-notes-section {
  border-top: 1px solid rgba(201,168,76,.1);
  padding-top: 12px;
  display: flex; flex-direction: column; gap: 8px;
}

/* Table notes cell */
.tbl-notes-cell { max-width: 220px; min-width: 140px; cursor: default !important; }

/* Table cells */
.tbl-unit  { font-weight: 500; color: var(--white); }
.tbl-guard { color: var(--white); }
.tbl-dim   { color: var(--dim); font-size: 10px; }
.tbl-time  { display: flex; flex-direction: column; gap: 1px; }
.tbl-time-ago  { font-size: 10px; color: var(--white); }
.tbl-time-full { font-size: 9px; color: var(--dim); }
.tbl-admin { font-size: 9px; color: var(--dim); background: rgba(255,255,255,.05); padding: 2px 6px; border-radius: 2px; }
.btn-row-expand { padding: 4px 8px; background: transparent; border: 1px solid rgba(255,255,255,.1); color: var(--dim); font-size: 9px; cursor: pointer; transition: color .15s; }
.btn-row-expand:hover { color: var(--white); }

/* Action badge */
.action-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 9px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;
  padding: 3px 8px; border: 1px solid; border-radius: 2px; white-space: nowrap;
}
.action-icon { font-size: 10px; font-weight: 900; }

/* Shift badge */
.shift-badge { font-size: 9px; font-weight: 600; white-space: nowrap; }
.shift-dia     { color: var(--gold); }
.shift-noche   { color: var(--blue); }
.shift-descanso{ color: #888; }

/* ── NOTES EDITOR ── */
.notes-display {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.notes-bubble {
  display: flex; align-items: flex-start; gap: 5px;
  background: rgba(201,168,76,.06); border: 1px solid rgba(201,168,76,.15);
  padding: 4px 8px; border-radius: 2px; max-width: 100%;
}
.notes-text {
  font-size: 10px; color: rgba(245,240,232,.75); line-height: 1.4;
  white-space: pre-wrap; word-break: break-word; flex: 1;
}
.notes-edit-btn {
  background: none; border: none; color: var(--dim); font-size: 11px;
  cursor: pointer; padding: 0 2px; line-height: 1; flex-shrink: 0;
  transition: color .15s; margin-top: 1px;
}
.notes-edit-btn:hover { color: var(--gold); }
.notes-add-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: none; border: 1px dashed rgba(255,255,255,.1);
  color: rgba(245,240,232,.3); font-family: 'Montserrat',sans-serif;
  font-size: 9px; font-weight: 500; letter-spacing: .5px; padding: 3px 8px;
  cursor: pointer; transition: all .15s; white-space: nowrap;
}
.notes-add-btn:hover {
  border-color: rgba(201,168,76,.3); color: rgba(201,168,76,.6);
}
.notes-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(255,255,255,.15); flex-shrink: 0; display: inline-block;
}
.notes-dot-filled { background: var(--gold); }
.notes-saved-flash {
  font-size: 9px; color: var(--green); font-weight: 600; letter-spacing: .5px;
  animation: fadeIn .2s ease;
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }

.notes-editor {
  display: flex; flex-direction: column; gap: 6px; width: 100%;
}
.notes-textarea {
  width: 100%; background: rgba(0,0,0,.4); border: 1px solid rgba(201,168,76,.3);
  color: var(--white); font-family: 'Montserrat',sans-serif; font-size: 10px;
  line-height: 1.5; padding: 7px 9px; outline: none; resize: vertical;
  min-height: 60px; transition: border-color .15s;
}
.notes-textarea:focus { border-color: var(--gold); }
.notes-textarea::placeholder { color: rgba(245,240,232,.25); }
.notes-actions {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;
}
.notes-hint { font-size: 8px; color: rgba(245,240,232,.2); letter-spacing: .3px; }
.notes-btns { display: flex; gap: 4px; }
.notes-btn-cancel {
  padding: 4px 10px; background: transparent;
  border: 1px solid rgba(255,255,255,.12); color: var(--dim);
  font-family: 'Montserrat',sans-serif; font-size: 9px; font-weight: 600;
  cursor: pointer; transition: all .15s;
}
.notes-btn-cancel:hover:not(:disabled) { border-color: rgba(255,255,255,.25); color: var(--white); }
.notes-btn-cancel:disabled { opacity: .4; cursor: not-allowed; }
.notes-btn-save {
  padding: 4px 12px; background: rgba(201,168,76,.12);
  border: 1px solid var(--gold); color: var(--gold);
  font-family: 'Montserrat',sans-serif; font-size: 9px; font-weight: 700; letter-spacing: .5px;
  cursor: pointer; transition: background .15s; display: flex; align-items: center; gap: 4px;
  clip-path: polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%);
}
.notes-btn-save:hover:not(:disabled) { background: rgba(201,168,76,.22); }
.notes-btn-save:disabled { opacity: .4; cursor: not-allowed; }
.notes-spinner {
  width: 10px; height: 10px; border: 1.5px solid rgba(201,168,76,.3);
  border-top-color: var(--gold); border-radius: 50%;
  animation: spin .6s linear infinite; display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Mobile notes */
.mc-notes {
  border-top: 1px solid rgba(255,255,255,.05);
  padding-top: 10px; margin-top: 6px;
}

/* Publish card notes */
.pub-card { flex-direction: column; }
.pub-main { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; width: 100%; }
.pub-notes {
  border-top: 1px solid rgba(255,255,255,.05);
  padding-top: 10px; margin-top: 4px; width: 100%;
}

/* Mobile cards */
.mobile-list { display: flex; flex-direction: column; gap: 8px; }
.mobile-card {
  background: var(--card); border-left: 3px solid transparent;
  border-top: 1px solid rgba(255,255,255,.05);
  border-right: 1px solid rgba(255,255,255,.05);
  border-bottom: 1px solid rgba(255,255,255,.05);
  padding: 12px 14px;
}
.mc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.mc-time { font-size: 9px; color: var(--dim); }
.mc-body { display: flex; flex-direction: column; gap: 5px; }
.mc-row  { display: flex; align-items: center; gap: 8px; }
.mc-lbl  { font-size: 11px; flex-shrink: 0; }
.mc-val  { font-size: 11px; color: var(--white); }

/* Loading */
.loading-state { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 60px; color: var(--dim); font-size: 11px; }
.loading-spinner { width: 18px; height: 18px; border: 2px solid rgba(201,168,76,.2); border-top-color: var(--gold); border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }

/* Empty */
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; gap: 10px; }
.empty-icon  { font-size: 40px; opacity: .25; }
.empty-title { font-family: 'Cormorant Garamond',serif; font-size: 22px; font-weight: 300; color: var(--white); opacity: .5; }
.empty-sub   { font-size: 11px; color: var(--dim); text-align: center; max-width: 280px; line-height: 1.5; }

/* Publish list */
.pub-list { display: flex; flex-direction: column; gap: 8px; }
.pub-card {
  background: var(--card); border-left: 3px solid transparent;
  border-top: 1px solid rgba(255,255,255,.05);
  border-right: 1px solid rgba(255,255,255,.05);
  border-bottom: 1px solid rgba(255,255,255,.05);
  padding: 14px 16px;
}
.pub-card-unpub { opacity: .6; }
.pub-left { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
.pub-icon {
  width: 36px; height: 36px; border-radius: 2px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 900; flex-shrink: 0;
}
.pub-info { flex: 1; min-width: 0; }
.pub-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.pub-title { font-size: 13px; font-weight: 600; color: var(--white); }
.pub-week  { font-size: 10px; color: var(--dim); }
.pub-meta  { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 10px; color: var(--dim); }
.pub-count { color: var(--gold); font-weight: 600; }
.pub-sep   { opacity: .4; }
.btn-unpublish {
  padding: 8px 14px; background: transparent;
  border: 1px solid rgba(77,163,255,.3); color: var(--blue);
  font-family: 'Montserrat',sans-serif; font-size: 9px; font-weight: 600;
  letter-spacing: 1px; text-transform: uppercase; cursor: pointer;
  transition: background .2s; flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  clip-path: polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%);
}
.btn-unpublish:hover:not(:disabled) { background: rgba(77,163,255,.08); }
.btn-unpublish:disabled { opacity: .4; cursor: not-allowed; }
.pub-spinner { width: 12px; height: 12px; border: 2px solid rgba(77,163,255,.3); border-top-color: var(--blue); border-radius: 50%; animation: spin .6s linear infinite; display: inline-block; }
.pub-reverted-badge { font-size: 8px; font-weight: 700; letter-spacing: .5px; color: var(--dim); background: rgba(255,255,255,.05); padding: 4px 10px; border: 1px solid rgba(255,255,255,.1); flex-shrink: 0; }

/* Desktop */
@media (min-width: 768px) {
  .hp { padding: 36px 32px 48px; }
  .mobile-list { display: none; }
  .tbl-scroll { display: block; }
}
@media (max-width: 767px) {
  .tbl-scroll { display: none; }
  .mobile-list { display: flex; }
}
`;