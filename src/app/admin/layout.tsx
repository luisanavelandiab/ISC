"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/services/firebase";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  const navLinks = [
    { href: "/admin",           label: "Dashboard", icon: "◈" },
    { href: "/admin/units",     label: "Unidades",  icon: "◉" },
    { href: "/admin/personal",  label: "Personal",  icon: "◆" },
    { href: "/admin/reportes",  label: "Reportes",  icon: "◎" },
    { href: "/admin/alertas",   label: "Alertas",   icon: "◇" },
    { href: "/admin/historial", label: "Historial", icon: "◬" },
  ];

  return (
    <>
      <style>{CSS}</style>

      {/* ── Overlay móvil ── */}
      {mobileOpen && (
        <div className="mob-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <div className="admin-layout">

        {/* ── Top bar móvil ── */}
        <header className="mob-topbar">
          <div className="mob-brand">
            <p className="mob-label">ISC</p>
            <h2 className="mob-title"><span>ISC</span> Control</h2>
          </div>
          <button
            className={"mob-toggle" + (mobileOpen ? " open" : "")}
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Menú"
          >
            <span /><span /><span />
          </button>
        </header>

        {/* ── Sidebar ── */}
        <aside className={"sidebar" + (mobileOpen ? " open" : "")}>

          {/* Brand */}
          <div className="sidebar-brand">
            <p className="sidebar-label">Sistema de gestión</p>
            <h2 className="sidebar-title"><span>ISC</span> Control</h2>
            <div className="sidebar-ornament">
              <div className="sidebar-ornament-line" />
              <div className="sidebar-ornament-dot" />
            </div>
          </div>

          {/* Nav */}
          <nav className="sidebar-nav">
            <p className="nav-section-label">Navegación</p>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={"nav-link" + (pathname === link.href ? " active" : "")}
                onClick={() => setMobileOpen(false)}
              >
                <span className="nav-icon">{link.icon}</span>
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Footer */}
          <div className="sidebar-footer">
            <button className="logout-btn" onClick={handleLogout}>
              <span style={{ fontSize: 14 }}>✕</span>
              Cerrar sesión
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="admin-main">
          {children}
        </main>
      </div>
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Montserrat:wght@300;400;500;600&display=swap');
*,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }

:root {
  --gold:#C9A84C; --gold-light:#E8C97A; --gold-dark:#8B6914;
  --black:#0A0A0A; --black-mid:#111111; --black-card:#161616;
  --white:#F5F0E8; --white-dim:rgba(245,240,232,0.5);
  --border:rgba(201,168,76,0.15);
  --danger:#E57373;
}

body { background:var(--black); font-family:'Montserrat',sans-serif; overflow-x:hidden; }

/* ════════════════════════════════
   TOP BAR MÓVIL — visible < 768px
════════════════════════════════ */
.mob-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  height: 56px;
  background: var(--black-mid);
  border-bottom: 1px solid var(--border);
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 200;
}

/* Patrón — idéntico al home */
.mob-topbar::before {
  content:'';
  position:absolute;inset:0;
  background-image:
    linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),
    linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);
  background-size:40px 40px;
  pointer-events:none;
}

.mob-brand { position:relative;z-index:1; }
.mob-label { font-size:8px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:1px; }
.mob-title { font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:300;color:var(--white);letter-spacing:-.5px; }
.mob-title span { color:var(--gold);font-style:italic;font-weight:600; }

/* Hamburger */
.mob-toggle {
  position:relative;z-index:1;
  width:36px;height:36px;
  background:transparent;
  border:1px solid var(--border);
  cursor:pointer;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  gap:5px;
  clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%);
  transition:border-color .2s;
}
.mob-toggle:hover { border-color:var(--gold); }
.mob-toggle span {
  display:block;width:18px;height:1.5px;
  background:var(--white-dim);
  transition:all .3s ease;
  transform-origin:center;
}
/* X cuando open */
.mob-toggle.open span:nth-child(1) { transform:translateY(6.5px) rotate(45deg);background:var(--gold); }
.mob-toggle.open span:nth-child(2) { opacity:0;transform:scaleX(0); }
.mob-toggle.open span:nth-child(3) { transform:translateY(-6.5px) rotate(-45deg);background:var(--gold); }

/* Overlay detrás del sidebar en móvil */
.mob-overlay {
  display:none;
  position:fixed;inset:0;
  background:rgba(0,0,0,.6);
  backdrop-filter:blur(4px);
  z-index:299;
}

/* ════════════════════════════════
   LAYOUT
════════════════════════════════ */
.admin-layout {
  display:flex;
  min-height:100vh;
  padding-top:56px; /* espacio para topbar móvil */
}

/* ════════════════════════════════
   SIDEBAR
════════════════════════════════ */
.sidebar {
  width:240px;
  min-width:240px;
  background:var(--black-mid);
  border-right:1px solid var(--border);
  display:flex;
  flex-direction:column;
  padding:28px 20px;
  position:relative;
  overflow:hidden;

  /* Móvil: fuera de pantalla por defecto */
  position:fixed;
  top:56px; left:0; bottom:0;
  z-index:300;
  transform:translateX(-100%);
  transition:transform .3s ease, box-shadow .3s ease;
}

.sidebar.open {
  transform:translateX(0);
  box-shadow:4px 0 40px rgba(0,0,0,.8);
}

/* Patrón de fondo — idéntico al home */
.sidebar::before {
  content:'';
  position:absolute;inset:0;
  background-image:
    linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),
    linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);
  background-size:40px 40px;
  pointer-events:none;
}

/* Glow superior — igual que home */
.sidebar::after {
  content:'';
  position:absolute;
  top:-60px;left:50%;transform:translateX(-50%);
  width:200px;height:200px;
  background:radial-gradient(ellipse,rgba(201,168,76,.08) 0%,transparent 70%);
  pointer-events:none;
}

.sidebar > * { position:relative;z-index:1; }

/* ── Brand ── */
.sidebar-brand {
  margin-bottom:32px;
  padding-bottom:22px;
  border-bottom:1px solid var(--border);
}

.sidebar-label {
  font-size:9px;font-weight:600;letter-spacing:4px;
  text-transform:uppercase;color:var(--gold);margin-bottom:6px;
}

.sidebar-title {
  font-family:'Cormorant Garamond',serif;
  font-size:26px;font-weight:300;color:var(--white);
  letter-spacing:-.5px;line-height:1.1;
}
.sidebar-title span { color:var(--gold);font-style:italic;font-weight:600; }

/* Ornamento — idéntico al home */
.sidebar-ornament {
  display:flex;align-items:center;gap:8px;margin-top:8px;
}
.sidebar-ornament-line {
  height:1px;flex:1;
  background:linear-gradient(90deg,var(--gold),transparent);
  opacity:.4;
}
.sidebar-ornament-dot {
  width:4px;height:4px;
  background:var(--gold);transform:rotate(45deg);
  opacity:.6;flex-shrink:0;
  box-shadow:0 0 6px rgba(201,168,76,.5);
}

/* ── Nav ── */
.sidebar-nav { display:flex;flex-direction:column;gap:3px;flex:1; }

.nav-section-label {
  font-size:8px;letter-spacing:3px;text-transform:uppercase;
  color:rgba(201,168,76,.4);margin-bottom:8px;margin-top:4px;padding-left:12px;
}

.nav-link {
  display:flex;align-items:center;gap:12px;
  padding:12px 14px;
  color:var(--white-dim);text-decoration:none;
  font-size:12px;font-weight:400;letter-spacing:1px;
  border:1px solid transparent;
  transition:all .2s ease;
  position:relative;
  clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);
}
.nav-link:hover {
  color:var(--white);
  background:rgba(201,168,76,.07);
  border-color:rgba(201,168,76,.15);
}
.nav-link.active {
  color:var(--gold);
  background:rgba(201,168,76,.1);
  border-color:rgba(201,168,76,.3);
}
.nav-link.active::before {
  content:'';position:absolute;left:0;top:0;bottom:0;
  width:2px;background:var(--gold);
  box-shadow:0 0 8px rgba(201,168,76,.6);
}
.nav-icon { font-size:14px;color:var(--gold);opacity:.7;flex-shrink:0;width:16px;text-align:center; }
.nav-link.active .nav-icon { opacity:1; }

/* ── Footer ── */
.sidebar-footer { padding-top:22px;border-top:1px solid var(--border); }

.logout-btn {
  width:100%;padding:11px 14px;
  background:transparent;border:1px solid rgba(229,115,115,.25);
  color:rgba(229,115,115,.7);
  font-family:'Montserrat',sans-serif;font-size:11px;font-weight:500;
  letter-spacing:2px;text-transform:uppercase;
  cursor:pointer;
  clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);
  transition:all .2s ease;text-align:left;
  display:flex;align-items:center;gap:10px;
}
.logout-btn:hover {
  background:rgba(229,115,115,.08);
  border-color:rgba(229,115,115,.5);
  color:var(--danger);
}

/* ════════════════════════════════
   MAIN
════════════════════════════════ */
.admin-main {
  flex:1;
  background:var(--black);
  overflow-y:auto;
  min-height:100vh;
  /* en móvil ocupa todo el ancho */
  width:100%;
}

/* ════════════════════════════════
   BOTTOM NAV MÓVIL
   Acceso rápido a las 4 secciones
   principales sin abrir sidebar
════════════════════════════════ */
.mob-bottom-nav {
  display:flex;
  position:fixed;bottom:0;left:0;right:0;
  background:var(--black-mid);
  border-top:1px solid var(--border);
  z-index:200;
}
.mob-bottom-nav::before {
  content:'';position:absolute;inset:0;
  background-image:
    linear-gradient(45deg,rgba(201,168,76,.02) 1px,transparent 1px),
    linear-gradient(-45deg,rgba(201,168,76,.02) 1px,transparent 1px);
  background-size:30px 30px;pointer-events:none;
}
.mob-nav-item {
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;padding:8px 4px 10px;
  color:var(--white-dim);text-decoration:none;
  font-size:9px;font-weight:500;letter-spacing:1px;text-transform:uppercase;
  transition:color .2s;position:relative;
}
.mob-nav-item.active { color:var(--gold); }
.mob-nav-item.active::before {
  content:'';position:absolute;top:0;left:10%;right:10%;
  height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);
}
.mob-nav-item:hover { color:var(--white); }
.mob-nav-icon { font-size:16px;line-height:1; }
.mob-nav-label { font-size:8px; }

/* ════════════════════════════════
   DESKTOP ≥ 768px
════════════════════════════════ */
@media(min-width:768px) {
  /* Ocultar elementos móvil */
  .mob-topbar      { display:none; }
  .mob-overlay     { display:none !important; }
  .mob-bottom-nav  { display:none; }

  /* Layout full */
  .admin-layout { padding-top:0; }

  /* Sidebar siempre visible, no fixed */
  .sidebar {
    position:relative;
    top:auto;left:auto;bottom:auto;
    transform:none !important;
    box-shadow:none;
    height:auto;
    min-height:100vh;
  }

  /* Main con margen normal */
  .admin-main { width:auto; }
}

@media(min-width:640px) and (max-width:767px) {
  /* Tablet pequeño: sidebar más ancho */
  .sidebar { width:280px;min-width:280px; }
}

/* Ajuste padding bottom en móvil para bottom nav */
@media(max-width:767px) {
  .mob-overlay { display:block; }
  .admin-main  { padding-bottom:64px; }
}
`;
