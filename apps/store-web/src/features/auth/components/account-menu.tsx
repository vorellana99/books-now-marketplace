import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { Button } from "@/shared/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu.tsx";
import { SheetClose } from "@/shared/ui/sheet.tsx";
import { useSignOut } from "../hooks/use-sign-out.ts";
import { useSession } from "../index.ts";

// La cuenta en la cabecera de escritorio: «Entrar» y «Crear cuenta» sin sesión, o el menú de la cuenta con ella. Mientras
// se recupera la sesión no muestra ninguna de las dos (no parpadea)
export function AccountMenu() {
  const { status, user } = useSession();
  const signOut = useSignOut();
  if (status === "unknown") return null;
  if (status === "anonymous") {
    return (
      <>
        <Link to="/ingresar" className="hover:text-primary">
          Entrar
        </Link>
        <Button asChild>
          <Link to="/registro">Crear cuenta</Link>
        </Button>
      </>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="text-foreground">
          Mi cuenta
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/pedidos">Mis pedidos</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>Cerrar sesión</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Lo mismo, dentro de la hoja del menú móvil
export function MobileAccount() {
  const { status, user } = useSession();
  const signOut = useSignOut();
  if (status === "unknown") return null;
  const row = "flex min-h-12 items-center border-b border-border px-2 font-medium";
  if (status === "anonymous") {
    return (
      <>
        <SheetClose asChild>
          <Link to="/ingresar" className={row}>
            Entrar
          </Link>
        </SheetClose>
        <SheetClose asChild>
          <Link to="/registro" className={row}>
            Crear cuenta
          </Link>
        </SheetClose>
      </>
    );
  }
  return (
    <>
      <p className="px-2 pt-3 text-sm text-muted-foreground">{user?.email}</p>
      <SheetClose asChild>
        <Link to="/pedidos" className={row}>
          Mis pedidos
        </Link>
      </SheetClose>
      <SheetClose asChild>
        <button type="button" onClick={() => void signOut()} className={`${row} w-full text-left`}>
          Cerrar sesión
        </button>
      </SheetClose>
    </>
  );
}
