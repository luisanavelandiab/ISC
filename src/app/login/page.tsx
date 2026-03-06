"use client";

import { useState } from "react";
import Image from "next/image";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/services/firebase";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const router = useRouter();

  const validateEmail = (value: string) => {
    const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(".+"))@(([^<>()[\]\\.,;:\s@\"]+\.)+[^<>()[\]\\.,;:\s@\"]{2,})$/i;
    return re.test(value);
  };

  const handleLogin = async () => {
    let ok = true;
    if (!email || !validateEmail(email)) {
      setEmailError("Introduce un correo válido");
      ok = false;
    }
    if (!password || password.length < 6) {
      setPasswordError("La contraseña debe tener al menos 6 caracteres");
      ok = false;
    }
    if (!ok) return;

    try {
      setLoading(true);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userDoc = await getDoc(doc(db, "users", user.uid));

      if (!userDoc.exists()) {
        alert("Este usuario no tiene rol asignado");
        setLoading(false);
        return;
      }

      const role = (userDoc.data().role || userDoc.data().authRole || "").toLowerCase();

      if (!role) {
        alert("El usuario no tiene un rol asignado");
        setLoading(false);
        return;
      }

      // ── Guardar rol en cookie para el middleware ──
      document.cookie = `isc-role=${role}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Strict`;

      if (role === "admin")            router.push("/admin");
      else if (role === "coordinador") router.push("/coordinador");
      else if (role === "vigilante")   router.push("/vigilante");
      else                             router.push("/");

    } catch (error) {
      console.error("Error al iniciar sesión:", error);
      alert("Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailBlur = () => {
    if (!email) setEmailError("El correo es obligatorio");
    else if (!validateEmail(email)) setEmailError("Correo no válido");
    else setEmailError(null);
  };

  const handlePasswordBlur = () => {
    if (!password) setPasswordError("La contraseña es obligatoria");
    else if (password.length < 6) setPasswordError("La contraseña debe tener al menos 6 caracteres");
    else setPasswordError(null);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Montserrat:wght@300;400;500;600&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
          --gold: #C9A84C;
          --gold-light: #E8C97A;
          --gold-dark: #8B6914;
          --black: #0A0A0A;
          --black-mid: #111111;
          --black-card: #161616;
          --white: #F5F0E8;
          --white-dim: rgba(245, 240, 232, 0.55);
          --error: #E57373;
        }

        body {
          background: var(--black);
          min-height: 100vh;
          font-family: 'Montserrat', sans-serif;
        }

        .login-wrapper {
          min-height: 100vh;
          background: var(--black);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .login-wrapper::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(45deg, rgba(201,168,76,0.03) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(201,168,76,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
        }

        .login-wrapper::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 700px;
          height: 700px;
          background: radial-gradient(ellipse, rgba(201,168,76,0.07) 0%, transparent 70%);
          pointer-events: none;
        }

        .corner {
          position: absolute;
          width: 40px;
          height: 40px;
          opacity: 0.4;
        }
        .corner-tl { top: 20px; left: 20px; border-top: 1px solid var(--gold); border-left: 1px solid var(--gold); }
        .corner-tr { top: 20px; right: 20px; border-top: 1px solid var(--gold); border-right: 1px solid var(--gold); }
        .corner-bl { bottom: 20px; left: 20px; border-bottom: 1px solid var(--gold); border-left: 1px solid var(--gold); }
        .corner-br { bottom: 20px; right: 20px; border-bottom: 1px solid var(--gold); border-right: 1px solid var(--gold); }

        .login-card {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 420px;
          padding: 52px 44px 48px;
          background: var(--black-card);
          border: 1px solid rgba(201,168,76,0.18);
          box-shadow:
            0 0 0 1px rgba(201,168,76,0.06) inset,
            0 24px 80px rgba(0,0,0,0.7),
            0 0 60px rgba(201,168,76,0.05);
          animation: fadeUp 0.8s ease both;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .ornament {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          margin-bottom: 32px;
          animation: fadeUp 0.8s ease 0.1s both;
        }
        .ornament-line {
          height: 1px;
          width: 60px;
          background: linear-gradient(90deg, transparent, var(--gold));
        }
        .ornament-line.right {
          background: linear-gradient(90deg, var(--gold), transparent);
        }
        .ornament-diamond {
          width: 7px;
          height: 7px;
          background: var(--gold);
          transform: rotate(45deg);
          box-shadow: 0 0 10px rgba(201,168,76,0.6);
        }

        .logo-wrap {
          text-align: center;
          animation: fadeUp 0.8s ease 0.15s both;
        }
        .logo-wrap img {
          border-radius: 50%;
          border: 2px solid rgba(201,168,76,0.35);
          box-shadow: 0 0 28px rgba(201,168,76,0.15);
          object-fit: cover;
        }

        .login-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 36px;
          font-weight: 300;
          color: var(--white);
          text-align: center;
          letter-spacing: -0.5px;
          margin-top: 14px;
          animation: fadeUp 0.8s ease 0.2s both;
        }
        .login-title span {
          color: var(--gold);
          font-style: italic;
          font-weight: 600;
        }

        .divider {
          width: 48px;
          height: 1px;
          background: linear-gradient(90deg, var(--gold-dark), var(--gold-light), var(--gold-dark));
          margin: 20px auto 32px;
          animation: fadeUp 0.8s ease 0.25s both;
        }

        .field-group {
          position: relative;
          margin-bottom: 20px;
          animation: fadeUp 0.8s ease 0.3s both;
        }
        .field-group + .field-group {
          animation-delay: 0.36s;
        }

        .field-label {
          display: block;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--gold);
          margin-bottom: 8px;
        }

        .field-input-wrap {
          position: relative;
        }

        .field-input {
          width: 100%;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(201,168,76,0.2);
          color: var(--white);
          font-family: 'Montserrat', sans-serif;
          font-size: 13px;
          font-weight: 300;
          padding: 13px 16px;
          outline: none;
          transition: border-color 0.25s, box-shadow 0.25s, background 0.25s;
          clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%);
        }
        .field-input::placeholder { color: transparent; }
        .field-input:focus {
          border-color: rgba(201,168,76,0.6);
          background: rgba(201,168,76,0.04);
          box-shadow: 0 0 20px rgba(201,168,76,0.08);
        }
        .field-group.has-error .field-input {
          border-color: var(--error);
        }

        .field-input.with-toggle {
          padding-right: 44px;
        }

        .pwd-toggle {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: var(--gold);
          opacity: 0.7;
          padding: 4px;
          display: flex;
          align-items: center;
          transition: opacity 0.2s;
        }
        .pwd-toggle:hover { opacity: 1; }
        .pwd-toggle svg { width: 18px; height: 18px; }

        .field-error {
          margin-top: 6px;
          font-size: 10px;
          letter-spacing: 1px;
          color: var(--error);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .field-error::before {
          content: '—';
          color: var(--error);
          opacity: 0.6;
        }

        .btn-login {
          margin-top: 32px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px 0;
          font-family: 'Montserrat', sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: var(--black);
          background: linear-gradient(135deg, var(--gold-light), var(--gold), var(--gold-dark));
          border: none;
          cursor: pointer;
          clip-path: polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%);
          transition: all 0.3s ease;
          box-shadow: 0 4px 24px rgba(201,168,76,0.3), 0 0 60px rgba(201,168,76,0.08);
          animation: fadeUp 0.8s ease 0.42s both;
        }
        .btn-login:hover:not(:disabled) {
          background: linear-gradient(135deg, var(--white), var(--gold-light), var(--gold));
          box-shadow: 0 6px 36px rgba(201,168,76,0.5), 0 0 80px rgba(201,168,76,0.15);
          transform: translateY(-2px);
          letter-spacing: 5px;
        }
        .btn-login:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .btn-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(0,0,0,0.3);
          border-top-color: var(--black);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .bottom-ornament {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          margin-top: 36px;
          animation: fadeUp 0.8s ease 0.5s both;
        }
        .bottom-ornament-line {
          height: 1px;
          flex: 1;
          background: linear-gradient(90deg, transparent, rgba(201,168,76,0.2));
        }
        .bottom-ornament-line.right {
          background: linear-gradient(90deg, rgba(201,168,76,0.2), transparent);
        }
        .bottom-ornament-text {
          font-size: 9px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: rgba(201,168,76,0.35);
        }
      `}</style>

      <div className="login-wrapper">
        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />

        <div className="login-card">
          <div className="ornament">
            <div className="ornament-line" />
            <div className="ornament-diamond" />
            <div className="ornament-line right" />
          </div>

          <div className="logo-wrap">
            <Image
              src="/imgs/logo.jpg"
              alt="ISC logo"
              width={110}
              height={110}
            />
            <h1 className="login-title">
              <span>ISC</span> Control
            </h1>
          </div>

          <div className="divider" />

          <div className={`field-group${emailError ? " has-error" : ""}`}>
            <label className="field-label">Correo electrónico</label>
            <div className="field-input-wrap">
              <input
                type="email"
                placeholder=""
                className="field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailBlur}
                aria-invalid={!!emailError}
              />
            </div>
            {emailError && <div className="field-error">{emailError}</div>}
          </div>

          <div className={`field-group${passwordError ? " has-error" : ""}`}>
            <label className="field-label">Contraseña</label>
            <div className="field-input-wrap">
              <input
                type={showPassword ? "text" : "password"}
                placeholder=""
                className="field-input with-toggle"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={handlePasswordBlur}
                aria-invalid={!!passwordError}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="pwd-toggle"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M10.58 10.58a3 3 0 0 0 4.24 4.24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M8.53 5.91A11.94 11.94 0 0 1 12 5c5 0 9.27 3 11 7-1.01 2.24-2.79 4.02-4.93 5.21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
            {passwordError && <div className="field-error">{passwordError}</div>}
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="btn-login"
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span className="btn-spinner" aria-hidden />
                Ingresando...
              </>
            ) : (
              "Ingresar"
            )}
          </button>

          <div className="bottom-ornament">
            <div className="bottom-ornament-line" />
            <span className="bottom-ornament-text">Acceso seguro</span>
            <div className="bottom-ornament-line right" />
          </div>
        </div>
      </div>
    </>
  );
}