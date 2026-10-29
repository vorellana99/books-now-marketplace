import { Link } from "@tanstack/react-router";
import { Menu, Search } from "lucide-react";
import { useState } from "react";
import { SearchBox } from "@/app/search-box.tsx";
import { Button } from "@/shared/ui/button.tsx";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/shared/ui/sheet.tsx";

// Wireframe: docs/product/diseno/03-wireframes.md#cabecera-y-navegación
// El carrito (F3) y el menú de la cuenta (F2) se agregan en sus cortes: hoy no hay rutas a las que llevar
export function Header() {
  const [searching, setSearching] = useState(false);

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-[1120px] items-center gap-1 px-2 py-2 md:gap-6 md:px-6">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-foreground md:hidden"
              aria-label="Abrir menú"
            >
              <Menu aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent title="Menú">
            <nav aria-label="Principal">
              <SheetClose asChild>
                <Link
                  to="/"
                  className="flex min-h-12 items-center border-b border-border px-2 font-medium"
                >
                  Libros
                </Link>
              </SheetClose>
            </nav>
          </SheetContent>
        </Sheet>

        <Link
          to="/"
          className="px-1.5 font-serif text-[1.375rem] leading-none font-semibold tracking-tight md:px-0 md:text-[1.625rem]"
        >
          Libro<span className="text-primary">Ya</span>
        </Link>

        <SearchBox id="buscar-escritorio" className="hidden max-w-[460px] flex-1 md:flex" />

        <nav
          aria-label="Principal"
          className="hidden items-center gap-5 font-medium md:ml-auto md:flex"
        >
          <Link to="/" className="hover:text-primary">
            Libros
          </Link>
        </nav>

        <div className="ml-auto md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground"
            aria-label="Buscar"
            aria-expanded={searching}
            aria-controls="buscar-movil-panel"
            onClick={() => setSearching((open) => !open)}
          >
            <Search aria-hidden="true" />
          </Button>
        </div>
      </div>

      {searching ? (
        <div id="buscar-movil-panel" className="px-4 pb-3 md:hidden">
          <SearchBox id="buscar-movil" />
        </div>
      ) : null}
    </header>
  );
}
