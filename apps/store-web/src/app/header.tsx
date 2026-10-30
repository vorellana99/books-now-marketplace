import { Link } from "@tanstack/react-router";
import { Menu, Search } from "lucide-react";
import { useState } from "react";
import { SearchBox } from "@/app/search-box.tsx";
import { AccountMenu, MobileAccount } from "@/features/auth/index.ts";
import { CartLink } from "@/features/cart/index.ts";
import { Button } from "@/shared/ui/button.tsx";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/shared/ui/sheet.tsx";

// Wireframe: docs/product/diseno/03-wireframes.md#cabecera-y-navegación
// Falta «Mis pedidos» (llega con F5: la ruta aún no existe y un enlace tipado a una ruta inexistente no compila)
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
              <MobileAccount />
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

        {/* Lo de la derecha: la búsqueda (solo móvil), el carrito con su contador y la cuenta (solo escritorio; en móvil
            está en el menú) */}
        <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground md:hidden"
            aria-label="Buscar"
            aria-expanded={searching}
            aria-controls="buscar-movil-panel"
            onClick={() => setSearching((open) => !open)}
          >
            <Search aria-hidden="true" />
          </Button>
          <CartLink />
          <div className="hidden items-center gap-5 font-medium md:flex">
            <AccountMenu />
          </div>
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
