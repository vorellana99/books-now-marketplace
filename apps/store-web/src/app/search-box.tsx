import { useNavigate, useSearch } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { cn } from "@/shared/lib/cn.ts";
import { Button } from "@/shared/ui/button.tsx";

type SearchBoxProps = {
  className?: string;
  // Identifica el campo cuando hay dos en la página (cabecera de escritorio y de móvil)
  id: string;
};

// Buscador de la cabecera. La búsqueda vive en la URL (`/?q=…&page=1`): se puede compartir y "atrás" funciona
export function SearchBox({ className, id }: SearchBoxProps) {
  const current = useSearch({
    strict: false,
    select: (search) => (typeof search.q === "string" ? search.q : ""),
  });
  // Si la URL cambia desde fuera (por ejemplo "Limpiar búsqueda"), el campo se reinicia con ella
  return <SearchField key={current} id={id} initial={current} className={className} />;
}

function SearchField({
  id,
  initial,
  className,
}: {
  id: string;
  initial: string;
  className: string | undefined;
}) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    void navigate({ to: "/", search: q ? { q, page: 1 } : { page: 1 } });
  }

  return (
    <form role="search" onSubmit={submit} className={cn("flex gap-2", className)}>
      <label htmlFor={id} className="sr-only">
        Buscar por título o autor
      </label>
      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-3 text-foreground">
        <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Título o autor"
          autoComplete="off"
          // 16 px como mínimo: en iOS, un campo con menos hace que el navegador amplíe la pantalla al enfocarlo
          className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => setValue("")}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        ) : null}
      </div>
      <Button type="submit">Buscar</Button>
    </form>
  );
}
