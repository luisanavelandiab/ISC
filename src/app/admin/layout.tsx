/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth, db } from "@/services/firebase";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) { await signOut(auth); router.replace("/login"); return; }
        const data = snap.data();
        const role = (data.role || data.authRole || "").toLowerCase();
        if (role === "admin") {
          setAuthorized(true);
        } else if (role === "coordinador") {
          router.replace("/coordinador");
        } else if (role === "vigilante") {
          router.replace("/vigilante");
        } else {
          router.replace("/login");
        }
      } catch (err) {
        console.error("Error verificando rol:", err);
        router.replace("/login");
      }
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    document.cookie = "isc-role=; path=/; max-age=0";
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

  if (!authorized) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Montserrat:wght@300;400;500;600&display=swap');
          *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
          body{background:#0A0A0A}
          .auth-screen{min-height:100vh;background:#0A0A0A;display:flex;align-items:center;justify-content:center;font-family:'Montserrat',sans-serif;position:relative;overflow:hidden;}
          .auth-screen::before{content:'';position:fixed;inset:0;background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;}
          .auth-inner{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:16px;}
          .auth-spinner{width:36px;height:36px;border:2px solid rgba(201,168,76,.15);border-top-color:#C9A84C;border-radius:50%;animation:spin .8s linear infinite;}
          @keyframes spin{to{transform:rotate(360deg)}}
          .auth-label{font-size:11px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:rgba(201,168,76,.6);}
          .auth-brand{font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:300;color:rgba(245,240,232,.2);letter-spacing:2px;margin-bottom:8px;}
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

      {mobileOpen && (
        <div className="mob-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <div className="admin-layout">

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

        <aside className={"sidebar" + (mobileOpen ? " open" : "")}>
          <div className="sidebar-brand">
            <p className="sidebar-label">Sistema de gestión</p>
            <h2 className="sidebar-title"><span>ISC</span> Control</h2>
            <div className="sidebar-ornament">
              <div className="sidebar-ornament-line" />
              <div className="sidebar-ornament-dot" />
            </div>
          </div>

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

          <div className="sidebar-footer">
            <button className="logout-btn" onClick={handleLogout}>
              <span style={{ fontSize: 16 }}>✕</span>
              Cerrar sesión
            </button>
          </div>
        </aside>

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

/* ── Mobile topbar ── */
.mob-topbar {
  display:flex; align-items:center; justify-content:space-between;
  padding:0 18px; height:60px; background:var(--black-mid);
  border-bottom:1px solid var(--border);
  position:fixed; top:0; left:0; right:0; z-index:200;
}
.mob-topbar::before {
  content:''; position:absolute; inset:0;
  background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);
  background-size:40px 40px; pointer-events:none;
}
.mob-brand { position:relative; z-index:1; }
.mob-label { font-size:10px; font-weight:600; letter-spacing:4px; text-transform:uppercase; color:var(--gold); margin-bottom:1px; }
.mob-title { font-family:'Cormorant Garamond',serif; font-size:22px; font-weight:300; color:var(--white); letter-spacing:-.5px; }
.mob-title span { color:var(--gold); font-style:italic; font-weight:600; }
.mob-toggle {
  position:relative; z-index:1; width:40px; height:40px;
  background:transparent; border:1px solid var(--border); cursor:pointer;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px;
  clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%); transition:border-color .2s;
}
.mob-toggle:hover { border-color:var(--gold); }
.mob-toggle span { display:block; width:20px; height:1.5px; background:var(--white-dim); transition:all .3s ease; transform-origin:center; }
.mob-toggle.open span:nth-child(1) { transform:translateY(6.5px) rotate(45deg); background:var(--gold); }
.mob-toggle.open span:nth-child(2) { opacity:0; transform:scaleX(0); }
.mob-toggle.open span:nth-child(3) { transform:translateY(-6.5px) rotate(-45deg); background:var(--gold); }
.mob-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); z-index:299; }

.admin-layout { display:flex; min-height:100vh; padding-top:60px; }

/* ── Sidebar ── */
.sidebar {
  width:256px; min-width:256px; background:var(--black-mid); border-right:1px solid var(--border);
  display:flex; flex-direction:column; padding:32px 22px;
  position:fixed; top:60px; left:0; bottom:0; z-index:300;
  transform:translateX(-100%); transition:transform .3s ease, box-shadow .3s ease; overflow:hidden;
}
.sidebar.open { transform:translateX(0); box-shadow:4px 0 40px rgba(0,0,0,.8); }
.sidebar::before {
  content:''; position:absolute; inset:0;
  background-image:linear-gradient(45deg,rgba(201,168,76,.03) 1px,transparent 1px),linear-gradient(-45deg,rgba(201,168,76,.03) 1px,transparent 1px);
  background-size:40px 40px; pointer-events:none;
}
.sidebar::after {
  content:''; position:absolute; top:-60px; left:50%; transform:translateX(-50%);
  width:200px; height:200px;
  background:radial-gradient(ellipse,rgba(201,168,76,.08) 0%,transparent 70%); pointer-events:none;
}
.sidebar > * { position:relative; z-index:1; }

.sidebar-brand { margin-bottom:36px; padding-bottom:24px; border-bottom:1px solid var(--border); }
.sidebar-label { font-size:11px; font-weight:600; letter-spacing:4px; text-transform:uppercase; color:var(--gold); margin-bottom:8px; }
.sidebar-title { font-family:'Cormorant Garamond',serif; font-size:30px; font-weight:300; color:var(--white); letter-spacing:-.5px; line-height:1.1; }
.sidebar-title span { color:var(--gold); font-style:italic; font-weight:600; }
.sidebar-ornament { display:flex; align-items:center; gap:8px; margin-top:10px; }
.sidebar-ornament-line { height:1px; flex:1; background:linear-gradient(90deg,var(--gold),transparent); opacity:.4; }
.sidebar-ornament-dot { width:4px; height:4px; background:var(--gold); transform:rotate(45deg); opacity:.6; flex-shrink:0; box-shadow:0 0 6px rgba(201,168,76,.5); }

/* ── Nav links ── */
.sidebar-nav { display:flex; flex-direction:column; gap:4px; flex:1; }
.nav-section-label { font-size:10px; letter-spacing:3px; text-transform:uppercase; color:rgba(201,168,76,.4); margin-bottom:10px; margin-top:4px; padding-left:14px; }
.nav-link {
  display:flex; align-items:center; gap:14px; padding:14px 16px;
  color:var(--white-dim); text-decoration:none;
  font-size:14px; font-weight:500; letter-spacing:.5px;
  border:1px solid transparent; transition:all .2s ease; position:relative;
  clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);
}
.nav-link:hover { color:var(--white); background:rgba(201,168,76,.07); border-color:rgba(201,168,76,.15); }
.nav-link.active { color:var(--gold); background:rgba(201,168,76,.1); border-color:rgba(201,168,76,.3); }
.nav-link.active::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background:var(--gold); box-shadow:0 0 8px rgba(201,168,76,.6); }
.nav-icon { font-size:16px; color:var(--gold); opacity:.7; flex-shrink:0; width:18px; text-align:center; }
.nav-link.active .nav-icon { opacity:1; }

/* ── Logout ── */
.sidebar-footer { padding-top:24px; border-top:1px solid var(--border); }
.logout-btn {
  width:100%; padding:13px 16px; background:transparent; border:1px solid rgba(229,115,115,.25);
  color:rgba(229,115,115,.7); font-family:'Montserrat',sans-serif;
  font-size:13px; font-weight:500; letter-spacing:2px; text-transform:uppercase; cursor:pointer;
  clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);
  transition:all .2s ease; text-align:left; display:flex; align-items:center; gap:12px;
}
.logout-btn:hover { background:rgba(229,115,115,.08); border-color:rgba(229,115,115,.5); color:var(--danger); }

.admin-main { flex:1; background:var(--black); overflow-y:auto; min-height:100vh; width:100%; }

@media(min-width:768px) {
  .mob-topbar     { display:none; }
  .mob-overlay    { display:none !important; }
  .admin-layout   { padding-top:0; }
  .sidebar { position:relative; top:auto; left:auto; bottom:auto; transform:none !important; box-shadow:none; height:auto; min-height:100vh; }
  .admin-main { width:auto; }
}
@media(min-width:640px) and (max-width:767px) {
  .sidebar { width:290px; min-width:290px; }
}
@media(max-width:767px) {
  .mob-overlay { display:block; }
  .admin-main  { padding-bottom:24px; }
}
`;