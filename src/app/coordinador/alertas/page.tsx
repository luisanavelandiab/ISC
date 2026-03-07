/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  collection, onSnapshot, query, where, orderBy,
  doc, updateDoc, addDoc, Timestamp, getDocs,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import Link from "next/link";

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type AlertSeverity = "critica" | "advertencia" | "info";
type AlertType =
  | "sin_cobertura"
  | "perfil_incorrecto"
  | "sin_descanso"
  | "cobertura_baja"
  | "cambios_sin_publicar"
  | "turno_duplicado";

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
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
  assignmentId?: string;
}

interface AlertRule {
  id: AlertType;
  label: string;
  description: string;
  enabled: boolean;
  severity: AlertSeverity;
}

const DEFAULT_RULES: AlertRule[] = [
  {
    id: "sin_cobertura",
    label: "Turno sin cubrir",
    description: "Alerta cuando una unidad tiene un turno (día o noche) sin ningún agente asignado.",
    enabled: true,
    severity: "critica",
  },
  {
    id: "perfil_incorrecto",
    label: "Perfil no compatible",
    description: "Alerta cuando el agente asignado no coincide con el perfil o categoría requerida por la unidad.",
    enabled: true,
    severity: "advertencia",
  },
  {
    id: "sin_descanso",
    label: "Sin descanso (6+ días consecutivos)",
    description: "Alerta cuando un agente lleva 6 o más días seguidos trabajando sin un día de descanso.",
    enabled: true,
    severity: "critica",
  },
  {
    id: "cobertura_baja",
    label: "Cobertura por debajo del umbral",
    description: "Alerta cuando la cobertura semanal de una unidad cae por debajo del mínimo configurado.",
    enabled: true,
    severity: "advertencia",
  },
  {
    id: "cambios_sin_publicar",
    label: "Cambios sin publicar (+48h)",
    description: "Alerta cuando hay asignaciones en borrador sin publicar por más de 48 horas.",
    enabled: true,
    severity: "info",
  },
  {
    id: "turno_duplicado",
    label: "Turno duplicado",
    description: "Alerta cuando un agente tiene dos turnos asignados el mismo día.",
    enabled: true,
    severity: "critica",
  },
];

const SEVERITY_CONFIG: Record<AlertSeverity, { label: string; color: string; bg: string; border: string; icon: string }> = {
  critica:     { label: "Crítica",     color: "#E57373", bg: "rgba(229,115,115,.08)",  border: "rgba(229,115,115,.25)", icon: "🔴" },
  advertencia: { label: "Advertencia", color: "#C9A84C", bg: "rgba(201,168,76,.08)",   border: "rgba(201,168,76,.25)",  icon: "🟡" },
  info:        { label: "Info",        color: "#4DA3FF", bg: "rgba(77,163,255,.08)",   border: "rgba(77,163,255,.25)",  icon: "🔵" },
};

const TYPE_LABELS: Record<AlertType, string> = {
  sin_cobertura:        "Sin cobertura",
  perfil_incorrecto:    "Perfil incorrecto",
  sin_descanso:         "Sin descanso",
  cobertura_baja:       "Cobertura baja",
  cambios_sin_publicar: "Sin publicar",
  turno_duplicado:      "Turno duplicado",
};

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
export default function AlertasPage() {
  const [activeAlerts,   setActiveAlerts]   = useState<AlertDoc[]>([]);
  const [resolvedAlerts, setResolvedAlerts] = useState<AlertDoc[]>([]);
  const [rules,          setRules]          = useState<AlertRule[]>(DEFAULT_RULES);
  const [tab,            setTab]            = useState<"activas" | "reglas" | "historial">("activas");
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | "todas">("todas");
  const [filterType,     setFilterType]     = useState<AlertType | "todas">("todas");
  const [resolving,      setResolving]      = useState<string | null>(null);
  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [minCoverage,    setMinCoverage]    = useState(70);
  const [minRestHours,   setMinRestHours]   = useState(8);

  // ── Firestore listeners ──
  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, "alerts"), where("resolved", "==", false), orderBy("createdAt", "desc")),
      (snap) => {
        setActiveAlerts(
          snap.docs.map((d) => {
            const raw = d.data();
            return {
              id: d.id, ...raw,
              createdAt: raw.createdAt?.toDate?.() || new Date(),
              date: raw.date?.toDate?.(),
              resolvedAt: raw.resolvedAt?.toDate?.(),
            } as AlertDoc;
          })
        );
      }
    );
    const u2 = onSnapshot(
      query(collection(db, "alerts"), where("resolved", "==", true), orderBy("resolvedAt", "desc")),
      (snap) => {
        setResolvedAlerts(
          snap.docs.slice(0, 50).map((d) => {
            const raw = d.data();
            return {
              id: d.id, ...raw,
              createdAt: raw.createdAt?.toDate?.() || new Date(),
              date: raw.date?.toDate?.(),
              resolvedAt: raw.resolvedAt?.toDate?.(),
            } as AlertDoc;
          })
        );
      }
    );
    return () => { u1(); u2(); };
  }, []);

  // ── Filtros ──
  const filteredActive = useMemo(() => {
    return activeAlerts.filter((a) => {
      if (filterSeverity !== "todas" && a.severity !== filterSeverity) return false;
      if (filterType !== "todas" && a.type !== filterType) return false;
      return true;
    });
  }, [activeAlerts, filterSeverity, filterType]);

  // Contadores por severidad
  const counts = useMemo(() => ({
    critica:     activeAlerts.filter((a) => a.severity === "critica").length,
    advertencia: activeAlerts.filter((a) => a.severity === "advertencia").length,
    info:        activeAlerts.filter((a) => a.severity === "info").length,
  }), [activeAlerts]);

  // ── Resolver alerta ──
  async function handleResolve(id: string) {
    setResolving(id);
    try {
      await updateDoc(doc(db, "alerts", id), {
        resolved: true,
        resolvedBy: "admin",
        resolvedAt: Timestamp.now(),
      });
    } finally {
      setResolving(null);
    }
  }

  // ── Resolver todas ──
  async function handleResolveAll() {
    const ids = filteredActive.map((a) => a.id);
    await Promise.all(
      ids.map((id) =>
        updateDoc(doc(db, "alerts", id), {
          resolved: true,
          resolvedBy: "admin",
          resolvedAt: Timestamp.now(),
        })
      )
    );
  }

  // ── Tiempo relativo ──
  function timeAgo(date: Date) {
    const diff = Date.now() - date.getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return "ahora";
    if (mins < 60)  return `hace ${mins}m`;
    if (hours < 24) return `hace ${hours}h`;
    return `hace ${days}d`;
  }

  function resolveTime(created: Date, resolved: Date) {
    const diff = resolved.getTime() - created.getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (mins < 60)  return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="ap">

        {/* ── Header ── */}
        <div className="ap-header">
          <Link href="/coordinador" className="ap-back">← Dashboard</Link>
          <div>
            <p className="ap-eye">Sistema de monitoreo</p>
            <h1 className="ap-title">Centro de <span>Alertas</span></h1>
          </div>
          {activeAlerts.length > 0 && (
            <div className="ap-live">
              <span className="live-dot" />
              {activeAlerts.length} activa{activeAlerts.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* ── KPIs ── */}
        <div className="kpi-row">
          <div className="kpi kpi-red" onClick={() => { setFilterSeverity("critica"); setTab("activas"); }}>
            <div className="kpi-icon">🔴</div>
            <div className="kpi-info">
              <div className="kpi-lbl">Críticas</div>
              <div className="kpi-val">{counts.critica}</div>
            </div>
          </div>
          <div className="kpi kpi-gold" onClick={() => { setFilterSeverity("advertencia"); setTab("activas"); }}>
            <div className="kpi-icon">🟡</div>
            <div className="kpi-info">
              <div className="kpi-lbl">Advertencias</div>
              <div className="kpi-val">{counts.advertencia}</div>
            </div>
          </div>
          <div className="kpi kpi-blue" onClick={() => { setFilterSeverity("info"); setTab("activas"); }}>
            <div className="kpi-icon">🔵</div>
            <div className="kpi-info">
              <div className="kpi-lbl">Informativas</div>
              <div className="kpi-val">{counts.info}</div>
            </div>
          </div>
          <div className="kpi kpi-dim" onClick={() => setTab("historial")}>
            <div className="kpi-icon">✓</div>
            <div className="kpi-info">
              <div className="kpi-lbl">Resueltas</div>
              <div className="kpi-val">{resolvedAlerts.length}</div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="tab-row">
          <button className={"tab-btn" + (tab === "activas"   ? " active" : "")} onClick={() => setTab("activas")}>
            🔔 Activas
            {activeAlerts.length > 0 && <span className="tab-badge">{activeAlerts.length}</span>}
          </button>
          <button className={"tab-btn" + (tab === "reglas"    ? " active" : "")} onClick={() => setTab("reglas")}>
            ⚙ Reglas
          </button>
          <button className={"tab-btn" + (tab === "historial" ? " active" : "")} onClick={() => setTab("historial")}>
            📋 Historial
          </button>
        </div>

        {/* ══════════════════════════════════════
            TAB: ALERTAS ACTIVAS
        ══════════════════════════════════════ */}
        {tab === "activas" && (
          <div className="panel">

            {/* Filtros */}
            <div className="filter-bar">
              <div className="filter-group">
                <span className="filter-lbl">Severidad</span>
                <div className="filter-chips">
                  {(["todas", "critica", "advertencia", "info"] as const).map((s) => (
                    <button
                      key={s}
                      className={"chip" + (filterSeverity === s ? " chip-active" : "")}
                      onClick={() => setFilterSeverity(s)}
                      style={filterSeverity === s && s !== "todas"
                        ? { borderColor: SEVERITY_CONFIG[s]?.color, color: SEVERITY_CONFIG[s]?.color }
                        : {}}
                    >
                      {s === "todas" ? "Todas" : SEVERITY_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filter-group">
                <span className="filter-lbl">Tipo</span>
                <select
                  className="filter-select"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                >
                  <option value="todas">Todos los tipos</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              {filteredActive.length > 0 && (
                <button className="btn-resolve-all" onClick={handleResolveAll}>
                  ✓ Resolver todas ({filteredActive.length})
                </button>
              )}
            </div>

            {/* Lista de alertas */}
            {filteredActive.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✓</div>
                <p className="empty-title">Sin alertas activas</p>
                <p className="empty-sub">
                  {filterSeverity !== "todas" || filterType !== "todas"
                    ? "No hay alertas con los filtros seleccionados."
                    : "Todo está operando dentro de los parámetros normales."}
                </p>
              </div>
            ) : (
              <div className="alert-list">
                {filteredActive.map((alert) => {
                  const sev = SEVERITY_CONFIG[alert.severity];
                  const isExpanded = expandedId === alert.id;
                  return (
                    <div
                      key={alert.id}
                      className={"alert-card" + (isExpanded ? " alert-expanded" : "")}
                      style={{ borderLeftColor: sev.color, background: sev.bg }}
                      onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                    >
                      <div className="alert-main">
                        <div className="alert-left">
                          <span className="alert-sev-icon">{sev.icon}</span>
                          <div className="alert-content">
                            <div className="alert-top">
                              <span className="alert-type-badge" style={{ color: sev.color, borderColor: sev.border }}>
                                {TYPE_LABELS[alert.type]}
                              </span>
                              {alert.unitName && (
                                <span className="alert-unit">📍 {alert.unitName}</span>
                              )}
                              {alert.guardName && (
                                <span className="alert-guard">👤 {alert.guardName}</span>
                              )}
                            </div>
                            <p className="alert-message">{alert.message}</p>
                            <div className="alert-meta">
                              <span className="alert-time">{timeAgo(alert.createdAt)}</span>
                              {alert.date && (
                                <span className="alert-date">
                                  · {alert.date.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="alert-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn-resolve"
                            onClick={() => handleResolve(alert.id)}
                            disabled={resolving === alert.id}
                            style={{ borderColor: sev.color, color: sev.color }}
                          >
                            {resolving === alert.id ? "…" : "Resolver"}
                          </button>
                          <button className="btn-expand" onClick={() => setExpandedId(isExpanded ? null : alert.id)}>
                            {isExpanded ? "▲" : "▼"}
                          </button>
                        </div>
                      </div>

                      {/* Detalle expandido */}
                      {isExpanded && (
                        <div className="alert-detail">
                          <div className="detail-grid">
                            <div className="detail-item">
                              <span className="detail-lbl">Severidad</span>
                              <span className="detail-val" style={{ color: sev.color }}>{sev.label}</span>
                            </div>
                            <div className="detail-item">
                              <span className="detail-lbl">Tipo</span>
                              <span className="detail-val">{TYPE_LABELS[alert.type]}</span>
                            </div>
                            {alert.unitName && (
                              <div className="detail-item">
                                <span className="detail-lbl">Unidad</span>
                                <span className="detail-val">{alert.unitName}</span>
                              </div>
                            )}
                            {alert.guardName && (
                              <div className="detail-item">
                                <span className="detail-lbl">Agente</span>
                                <span className="detail-val">{alert.guardName}</span>
                              </div>
                            )}
                            {alert.date && (
                              <div className="detail-item">
                                <span className="detail-lbl">Fecha del turno</span>
                                <span className="detail-val">
                                  {alert.date.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long" })}
                                </span>
                              </div>
                            )}
                            <div className="detail-item">
                              <span className="detail-lbl">Generada</span>
                              <span className="detail-val">
                                {alert.createdAt.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: REGLAS DE VALIDACIÓN
        ══════════════════════════════════════ */}
        {tab === "reglas" && (
          <div className="panel">
            <p className="panel-desc">
              Configura qué validaciones se ejecutan automáticamente al asignar agentes. 
              Los cambios se aplican de forma inmediata en el dashboard.
            </p>

            {/* Umbrales globales */}
            <div className="rules-section">
              <p className="rules-section-title">⚙ Parámetros globales</p>
              <div className="threshold-grid">
                <div className="threshold-item">
                  <div className="threshold-header">
                    <span className="threshold-lbl">Cobertura mínima por unidad</span>
                    <span className="threshold-val">{minCoverage}%</span>
                  </div>
                  <input
                    type="range" min={10} max={100} step={5}
                    value={minCoverage}
                    onChange={(e) => setMinCoverage(Number(e.target.value))}
                    className="threshold-slider"
                  />
                  <div className="threshold-marks">
                    <span>10%</span><span>50%</span><span>100%</span>
                  </div>
                  <p className="threshold-hint">
                    Se generará una alerta de tipo Cobertura baja cuando una unidad caiga por debajo de este porcentaje.
                  </p>
                </div>
                <div className="threshold-item">
                  <div className="threshold-header">
                    <span className="threshold-lbl">Horas mínimas de descanso entre turnos</span>
                    <span className="threshold-val">{minRestHours}h</span>
                  </div>
                  <input
                    type="range" min={4} max={24} step={1}
                    value={minRestHours}
                    onChange={(e) => setMinRestHours(Number(e.target.value))}
                    className="threshold-slider"
                  />
                  <div className="threshold-marks">
                    <span>4h</span><span>12h</span><span>24h</span>
                  </div>
                  <p className="threshold-hint">
                    Tiempo mínimo entre el fin de un turno y el inicio del siguiente para el mismo agente.
                  </p>
                </div>
              </div>
            </div>

            {/* Lista de reglas */}
            <div className="rules-section">
              <p className="rules-section-title">🔔 Tipos de alerta</p>
              <div className="rules-list">
                {rules.map((rule) => {
                  const sev = SEVERITY_CONFIG[rule.severity];
                  return (
                    <div key={rule.id} className={"rule-card" + (!rule.enabled ? " rule-disabled" : "")}>
                      <div className="rule-left">
                        <div className="rule-toggle-wrap">
                          <button
                            className={"rule-toggle" + (rule.enabled ? " toggle-on" : "")}
                            onClick={() =>
                              setRules((prev) =>
                                prev.map((r) =>
                                  r.id === rule.id ? { ...r, enabled: !r.enabled } : r
                                )
                              )
                            }
                          >
                            <span className="toggle-thumb" />
                          </button>
                        </div>
                        <div className="rule-info">
                          <div className="rule-name-row">
                            <span className="rule-name">{rule.label}</span>
                            <span className="rule-sev-badge" style={{ color: sev.color, borderColor: sev.border }}>
                              {sev.icon} {sev.label}
                            </span>
                          </div>
                          <p className="rule-desc">{rule.description}</p>
                        </div>
                      </div>
                      <div className="rule-right">
                        <select
                          className="rule-sev-select"
                          value={rule.severity}
                          onChange={(e) =>
                            setRules((prev) =>
                              prev.map((r) =>
                                r.id === rule.id
                                  ? { ...r, severity: e.target.value as AlertSeverity }
                                  : r
                              )
                            )
                          }
                          style={{ color: sev.color, borderColor: sev.border }}
                        >
                          <option value="critica">🔴 Crítica</option>
                          <option value="advertencia">🟡 Advertencia</option>
                          <option value="info">🔵 Info</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rules-footer">
              <p className="rules-note">
                💡 Los cambios de configuración se aplican a las <em>nuevas</em> asignaciones. 
                Las alertas ya generadas no se modifican retroactivamente.
              </p>
              <button className="btn-save-rules" onClick={() => alert("Configuración guardada (integra con Firestore según tu modelo de datos).")}>
                Guardar configuración
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: HISTORIAL RESUELTAS
        ══════════════════════════════════════ */}
        {tab === "historial" && (
          <div className="panel">
            <div className="hist-header">
              <p className="panel-desc">Últimas 50 alertas resueltas, ordenadas por fecha de resolución.</p>
            </div>

            {resolvedAlerts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <p className="empty-title">Sin historial aún</p>
                <p className="empty-sub">Las alertas resueltas aparecerán aquí.</p>
              </div>
            ) : (
              <div className="hist-table-wrap">
                <table className="hist-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Severidad</th>
                      <th>Unidad</th>
                      <th>Agente</th>
                      <th>Fecha turno</th>
                      <th>Generada</th>
                      <th>Resuelta</th>
                      <th>Tiempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedAlerts.map((alert) => {
                      const sev = SEVERITY_CONFIG[alert.severity];
                      return (
                        <tr key={alert.id}>
                          <td>
                            <span className="hist-type" style={{ color: sev.color }}>
                              {TYPE_LABELS[alert.type]}
                            </span>
                          </td>
                          <td>
                            <span className="hist-sev" style={{ color: sev.color }}>
                              {sev.icon} {sev.label}
                            </span>
                          </td>
                          <td className="hist-dim">{alert.unitName || "—"}</td>
                          <td className="hist-dim">{alert.guardName || "—"}</td>
                          <td className="hist-dim">
                            {alert.date
                              ? alert.date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
                              : "—"}
                          </td>
                          <td className="hist-dim">
                            {alert.createdAt.toLocaleDateString("es-ES", {
                              day: "2-digit", month: "short",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </td>
                          <td className="hist-dim">
                            {alert.resolvedAt
                              ? alert.resolvedAt.toLocaleDateString("es-ES", {
                                  day: "2-digit", month: "short",
                                  hour: "2-digit", minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td>
                            {alert.resolvedAt ? (
                              <span className="hist-time">
                                {resolveTime(alert.createdAt, alert.resolvedAt)}
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
.ap {
  background: var(--black); min-height: 100vh;
  font-family: 'Montserrat', sans-serif; color: var(--white);
  padding: 20px 16px 60px;
}
.ap::before {
  content: ''; position: fixed; inset: 0;
  background-image:
    linear-gradient(45deg,  rgba(201,168,76,.03) 1px, transparent 1px),
    linear-gradient(-45deg, rgba(201,168,76,.03) 1px, transparent 1px);
  background-size: 48px 48px; pointer-events: none; z-index: 0;
}
.ap > * { position: relative; z-index: 1; }

/* Header */
.ap-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.ap-back { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); text-decoration: none; padding: 6px 0; transition: color .2s; white-space: nowrap; align-self: center; }
.ap-back:hover { color: var(--gold); }
.ap-eye  { font-size: 9px; font-weight: 600; letter-spacing: 4px; text-transform: uppercase; color: var(--gold); margin-bottom: 4px; }
.ap-title { font-family: 'Cormorant Garamond', serif; font-size: clamp(22px,6vw,38px); font-weight: 300; color: var(--white); line-height: 1.1; }
.ap-title span { color: var(--red); font-style: italic; font-weight: 600; }
.ap-live { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 600; letter-spacing: 1px; color: var(--red); background: rgba(229,115,115,.08); border: 1px solid rgba(229,115,115,.2); padding: 6px 12px; align-self: center; margin-left: auto; white-space: nowrap; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--red); animation: livePulse 1.2s ease-in-out infinite; flex-shrink: 0; }
@keyframes livePulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.7); } }

/* KPIs */
.kpi-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; margin-bottom: 24px; }
.kpi { background: var(--card); border: 1px solid var(--border); padding: clamp(8px,2vw,16px); display: flex; align-items: center; gap: 10px; cursor: pointer; transition: border-color .2s; clip-path: polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%); }
.kpi:hover { border-color: var(--gold); }
.kpi-icon { font-size: clamp(18px,4vw,26px); flex-shrink: 0; }
.kpi-info { display: flex; flex-direction: column; gap: 2px; }
.kpi-lbl { font-size: clamp(6px,1.5vw,9px); font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--gold); }
.kpi-val { font-family: 'Cormorant Garamond', serif; font-size: clamp(22px,5vw,36px); font-weight: 300; line-height: 1; }
.kpi-red   { border-left: 2px solid rgba(229,115,115,.4); }
.kpi-gold  { border-left: 2px solid rgba(201,168,76,.4); }
.kpi-blue  { border-left: 2px solid rgba(77,163,255,.4); }
.kpi-dim   { border-left: 2px solid rgba(129,199,132,.4); }

/* Tabs */
.tab-row { display: flex; gap: 2px; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
.tab-btn { flex: 1; padding: 10px 6px; background: none; border: none; color: var(--dim); font-family: 'Montserrat',sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
.tab-btn.active { color: var(--gold); border-bottom-color: var(--gold); }
.tab-badge { background: var(--red); color: #fff; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 8px; }

/* Panel */
.panel { display: flex; flex-direction: column; gap: 16px; }
.panel-desc { font-size: 11px; color: var(--dim); line-height: 1.6; }

/* Filter bar */
.filter-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px; background: var(--card); border: 1px solid var(--border); }
.filter-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-lbl { font-size: 9px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); white-space: nowrap; }
.filter-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.chip { padding: 4px 10px; background: transparent; border: 1px solid rgba(255,255,255,.12); color: var(--dim); font-family: 'Montserrat',sans-serif; font-size: 9px; font-weight: 600; letter-spacing: .5px; cursor: pointer; transition: all .15s; }
.chip:hover { border-color: rgba(255,255,255,.3); color: var(--white); }
.chip-active { border-color: var(--gold); color: var(--gold); background: rgba(201,168,76,.08); }
.filter-select { padding: 5px 10px; background: var(--card2); border: 1px solid var(--border); color: var(--white); font-family: 'Montserrat',sans-serif; font-size: 10px; outline: none; cursor: pointer; }
.filter-select:focus { border-color: var(--gold); }
.btn-resolve-all { margin-left: auto; padding: 6px 14px; background: transparent; border: 1px solid rgba(129,199,132,.3); color: var(--green); font-family: 'Montserrat',sans-serif; font-size: 9px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; transition: background .2s; white-space: nowrap; }
.btn-resolve-all:hover { background: rgba(129,199,132,.08); }

/* Alert list */
.alert-list { display: flex; flex-direction: column; gap: 6px; }
.alert-card {
  border-left: 3px solid transparent; padding: 12px 14px;
  background: var(--card); border-top: 1px solid rgba(255,255,255,.04);
  border-right: 1px solid rgba(255,255,255,.04); border-bottom: 1px solid rgba(255,255,255,.04);
  cursor: pointer; transition: filter .15s;
}
.alert-card:hover { filter: brightness(1.08); }
.alert-expanded { filter: brightness(1.1); }
.alert-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.alert-left { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; }
.alert-sev-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
.alert-content { flex: 1; min-width: 0; }
.alert-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.alert-type-badge { font-size: 8px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; padding: 2px 7px; border: 1px solid; }
.alert-unit  { font-size: 9px; color: var(--dim); }
.alert-guard { font-size: 9px; color: var(--dim); }
.alert-message { font-size: 11px; color: var(--white); line-height: 1.5; margin-bottom: 5px; }
.alert-meta { display: flex; gap: 6px; font-size: 9px; color: var(--dim); }
.alert-time { }
.alert-date { }
.alert-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.btn-resolve { padding: 5px 12px; background: transparent; border: 1px solid; font-family: 'Montserrat',sans-serif; font-size: 9px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; transition: opacity .15s; white-space: nowrap; }
.btn-resolve:hover:not(:disabled) { opacity: .75; }
.btn-resolve:disabled { opacity: .4; cursor: not-allowed; }
.btn-expand { padding: 5px 8px; background: transparent; border: 1px solid rgba(255,255,255,.1); color: var(--dim); font-size: 9px; cursor: pointer; transition: color .15s; }
.btn-expand:hover { color: var(--white); }

/* Alert detail */
.alert-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.06); }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px,1fr)); gap: 10px; }
.detail-item { display: flex; flex-direction: column; gap: 3px; }
.detail-lbl { font-size: 8px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); }
.detail-val { font-size: 11px; color: var(--white); }

/* Empty state */
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; gap: 10px; }
.empty-icon  { font-size: 40px; opacity: .3; }
.empty-title { font-family: 'Cormorant Garamond',serif; font-size: 22px; font-weight: 300; color: var(--white); opacity: .5; }
.empty-sub   { font-size: 11px; color: var(--dim); text-align: center; max-width: 280px; line-height: 1.5; }

/* Rules */
.rules-section { background: var(--card); border: 1px solid var(--border); padding: 16px; }
.rules-section-title { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--gold); margin-bottom: 16px; }
.threshold-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
.threshold-item { display: flex; flex-direction: column; gap: 8px; }
.threshold-header { display: flex; justify-content: space-between; align-items: center; }
.threshold-lbl { font-size: 11px; color: var(--white); font-weight: 500; }
.threshold-val { font-family: 'Cormorant Garamond',serif; font-size: 22px; color: var(--gold); font-weight: 300; }
.threshold-slider { width: 100%; height: 3px; accent-color: var(--gold); cursor: pointer; }
.threshold-marks { display: flex; justify-content: space-between; font-size: 8px; color: var(--dim); }
.threshold-hint { font-size: 10px; color: var(--dim); line-height: 1.5; font-style: italic; }
.rules-list { display: flex; flex-direction: column; gap: 8px; }
.rule-card { background: var(--card2); border: 1px solid rgba(255,255,255,.05); padding: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; transition: opacity .2s; }
.rule-disabled { opacity: .45; }
.rule-left { display: flex; align-items: flex-start; gap: 12px; flex: 1; min-width: 0; }
.rule-toggle-wrap { flex-shrink: 0; padding-top: 2px; }
.rule-toggle { width: 36px; height: 20px; background: rgba(255,255,255,.1); border: none; border-radius: 10px; cursor: pointer; position: relative; transition: background .2s; padding: 0; }
.rule-toggle.toggle-on { background: var(--gold); }
.toggle-thumb { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; background: #fff; border-radius: 50%; transition: left .2s; display: block; }
.rule-toggle.toggle-on .toggle-thumb { left: 19px; }
.rule-info { flex: 1; min-width: 0; }
.rule-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.rule-name { font-size: 12px; font-weight: 600; color: var(--white); }
.rule-sev-badge { font-size: 8px; font-weight: 600; padding: 2px 7px; border: 1px solid; letter-spacing: .5px; }
.rule-desc { font-size: 10px; color: var(--dim); line-height: 1.5; }
.rule-right { flex-shrink: 0; }
.rule-sev-select { padding: 5px 8px; background: var(--card); border: 1px solid; font-family: 'Montserrat',sans-serif; font-size: 9px; cursor: pointer; outline: none; }
.rules-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 14px; background: var(--card); border: 1px solid var(--border); }
.rules-note { font-size: 10px; color: var(--dim); line-height: 1.5; flex: 1; }
.rules-note em { color: var(--gold); font-style: normal; }
.btn-save-rules { padding: 10px 20px; background: var(--gold); color: var(--black); border: none; font-family: 'Montserrat',sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; clip-path: polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%); transition: opacity .2s; flex-shrink: 0; }
.btn-save-rules:hover { opacity: .85; }

/* Historial table */
.hist-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.hist-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); }
.hist-table { width: 100%; border-collapse: collapse; min-width: 700px; font-size: 10px; }
.hist-table th { background: rgba(201,168,76,.08); padding: 10px 12px; text-align: left; font-size: 8px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--gold); border-bottom: 1px solid var(--border); white-space: nowrap; }
.hist-table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.04); vertical-align: middle; }
.hist-table tr:last-child td { border-bottom: none; }
.hist-table tr:hover td { background: rgba(201,168,76,.03); }
.hist-type { font-weight: 600; font-size: 10px; }
.hist-sev  { font-size: 10px; }
.hist-dim  { color: var(--dim); font-size: 10px; }
.hist-time { background: rgba(129,199,132,.1); color: var(--green); font-size: 9px; font-weight: 600; padding: 2px 7px; border: 1px solid rgba(129,199,132,.2); }

/* Desktop */
@media (min-width: 768px) {
  .ap { padding: 36px 32px 48px; }
  .threshold-grid { grid-template-columns: 1fr 1fr; }
  .kpi-lbl { font-size: 9px; }
}
`;