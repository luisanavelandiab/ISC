export default function Home() {
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
          --white-dim: rgba(245, 240, 232, 0.6);
        }

        body {
          background: var(--black);
          min-height: 100vh;
          font-family: 'Montserrat', sans-serif;
          overflow-x: hidden;
        }

        .home-wrapper {
          min-height: 100vh;
          background: var(--black);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        /* Fondo con patrón geométrico dorado sutil */
        .home-wrapper::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(45deg, rgba(201,168,76,0.03) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(201,168,76,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
        }

        /* Glow central */
        .home-wrapper::after {
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

        .content {
          position: relative;
          z-index: 10;
          text-align: center;
          padding: 60px 40px;
          max-width: 700px;
          width: 100%;
          animation: fadeUp 0.9s ease both;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Línea decorativa superior */
        .ornament {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-bottom: 40px;
          animation: fadeUp 0.9s ease 0.1s both;
        }

        .ornament-line {
          height: 1px;
          width: 80px;
          background: linear-gradient(90deg, transparent, var(--gold));
        }

        .ornament-line.right {
          background: linear-gradient(90deg, var(--gold), transparent);
        }

        .ornament-diamond {
          width: 8px;
          height: 8px;
          background: var(--gold);
          transform: rotate(45deg);
          box-shadow: 0 0 12px rgba(201,168,76,0.6);
        }

        /* Subtítulo */
        .subtitle-top {
          font-family: 'Montserrat', sans-serif;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 6px;
          text-transform: uppercase;
          color: var(--gold);
          margin-bottom: 20px;
          animation: fadeUp 0.9s ease 0.2s both;
        }

        /* Título principal */
        h1 {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(52px, 8vw, 80px);
          font-weight: 300;
          line-height: 1.05;
          color: var(--white);
          letter-spacing: -1px;
          margin-bottom: 12px;
          animation: fadeUp 0.9s ease 0.3s both;
        }

        h1 span {
          color: var(--gold);
          font-style: italic;
          font-weight: 600;
        }

        /* Línea separadora */
        .divider {
          width: 60px;
          height: 2px;
          background: linear-gradient(90deg, var(--gold-dark), var(--gold-light), var(--gold-dark));
          margin: 28px auto;
          animation: fadeUp 0.9s ease 0.4s both;
        }

        /* Descripción */
        .description {
          font-size: 13px;
          font-weight: 300;
          letter-spacing: 2px;
          color: var(--white-dim);
          text-transform: uppercase;
          margin-bottom: 56px;
          animation: fadeUp 0.9s ease 0.5s both;
        }

        /* Botón CTA */
        .cta-link {
          display: inline-block;
          text-decoration: none;
          position: relative;
          padding: 18px 52px;
          font-family: 'Montserrat', sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: var(--black);
          background: linear-gradient(135deg, var(--gold-light), var(--gold), var(--gold-dark));
          clip-path: polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%);
          transition: all 0.3s ease;
          animation: fadeUp 0.9s ease 0.6s both;
          box-shadow:
            0 4px 24px rgba(201,168,76,0.3),
            0 0 60px rgba(201,168,76,0.1);
        }

        .cta-link:hover {
          background: linear-gradient(135deg, var(--white), var(--gold-light), var(--gold));
          box-shadow:
            0 6px 36px rgba(201,168,76,0.5),
            0 0 80px rgba(201,168,76,0.2);
          transform: translateY(-2px);
          letter-spacing: 5px;
        }

        /* Badge de estado */
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 48px;
          padding: 8px 20px;
          border: 1px solid rgba(201,168,76,0.2);
          background: rgba(201,168,76,0.05);
          font-size: 10px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--white-dim);
          animation: fadeUp 0.9s ease 0.7s both;
        }

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4CAF50;
          box-shadow: 0 0 8px rgba(76,175,80,0.8);
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(0.8); }
        }

        /* Esquinas decorativas */
        .corner {
          position: absolute;
          width: 40px;
          height: 40px;
        }

        .corner-tl { top: 20px; left: 20px; border-top: 1px solid var(--gold); border-left: 1px solid var(--gold); opacity: 0.4; }
        .corner-tr { top: 20px; right: 20px; border-top: 1px solid var(--gold); border-right: 1px solid var(--gold); opacity: 0.4; }
        .corner-bl { bottom: 20px; left: 20px; border-bottom: 1px solid var(--gold); border-left: 1px solid var(--gold); opacity: 0.4; }
        .corner-br { bottom: 20px; right: 20px; border-bottom: 1px solid var(--gold); border-right: 1px solid var(--gold); opacity: 0.4; }

        /* Número decorativo */
        .bg-number {
          position: absolute;
          bottom: -40px;
          right: -20px;
          font-family: 'Cormorant Garamond', serif;
          font-size: 280px;
          font-weight: 700;
          color: rgba(201,168,76,0.03);
          pointer-events: none;
          line-height: 1;
          letter-spacing: -10px;
          user-select: none;
        }
      `}</style>

      <div className="home-wrapper">
        {/* Esquinas decorativas */}
        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />

        {/* Número decorativo de fondo */}
        <div className="bg-number">ISC</div>

        <div className="content">
          {/* Ornamento */}
          <div className="ornament">
            <div className="ornament-line" />
            <div className="ornament-diamond" />
            <div className="ornament-line right" />
          </div>

          <p className="subtitle-top">Plataforma de gestión</p>

          <h1>
            Sistema <span>ISC</span><br />Control
          </h1>

          <div className="divider" />


          <p className="description">Acceso seguro · Gestión integral · Control total</p>

          <a href="/login" className="cta-link">
            Acceder al sistema
          </a>

          <div>
            <div className="status-badge">
              <div className="status-dot" />
              Sistema operativo
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
