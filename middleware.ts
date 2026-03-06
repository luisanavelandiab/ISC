import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Rutas de /admin a las que el coordinador tiene acceso completo (puede editar)
const COORDINADOR_ALLOWED = [
  "/admin/alertas",
  "/admin/historial",
  "/admin/personal",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const role = request.cookies.get("isc-role")?.value?.toLowerCase();

  const isAdminRoute       = pathname.startsWith("/admin");
  const isCoordinadorRoute = pathname.startsWith("/coordinador");
  const isVigilanteRoute   = pathname.startsWith("/vigilante");
  const isProtected        = isAdminRoute || isCoordinadorRoute || isVigilanteRoute;

  // Sin cookie en ruta protegida → login
  if (!role && isProtected) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (role === "admin") {
    if (isCoordinadorRoute || isVigilanteRoute) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  if (role === "coordinador") {
    if (isAdminRoute) {
      // Dashboard exacto (/admin o /admin/) → siempre bloqueado
      const isDashboard = pathname === "/admin" || pathname === "/admin/";
      // Resto de /admin solo si está en la lista permitida
      const allowed = COORDINADOR_ALLOWED.some((r) => pathname.startsWith(r));
      if (isDashboard || !allowed) {
        return NextResponse.redirect(new URL("/coordinador", request.url));
      }
    }
    if (isVigilanteRoute) {
      return NextResponse.redirect(new URL("/coordinador", request.url));
    }
  }

  if (role === "vigilante") {
    if (isAdminRoute || isCoordinadorRoute) {
      return NextResponse.redirect(new URL("/vigilante", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/coordinador/:path*", "/vigilante/:path*"],
};