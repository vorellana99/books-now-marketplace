import type { ReactNode } from "react";
import { Header } from "@/app/header.tsx";

// Esqueleto de toda pantalla: enlace para saltar la cabecera, cabecera y contenido
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-3 focus:font-semibold"
      >
        Saltar al contenido
      </a>
      <Header />
      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1120px] px-4 py-6 outline-none md:px-6 md:py-8"
      >
        {children}
      </main>
    </>
  );
}
