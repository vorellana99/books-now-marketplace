import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { Button } from "@/shared/ui/button.tsx";
import { NotFoundState } from "@/shared/ui/state-panel.tsx";

// PA-10: página inexistente
export function NotFoundPage() {
  return (
    <>
      <title>Página no encontrada · LibroYa</title>
      <NotFoundState
        as="h1"
        icon={BookOpen}
        title="No encontramos esta página"
        description="Puede que el enlace esté incompleto o que ya no exista."
        action={
          <Button asChild>
            <Link to="/">Ir a los libros</Link>
          </Button>
        }
      />
    </>
  );
}
