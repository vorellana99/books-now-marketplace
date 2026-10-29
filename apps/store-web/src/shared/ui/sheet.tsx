import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button.tsx";

// Hoja lateral (el menú de la cabecera en móvil). Radix se encarga de lo difícil: atrapa el foco, se cierra
// con `Esc` y devuelve el foco al botón que la abrió
export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

type SheetContentProps = {
  // Obligatorio: es el nombre accesible del diálogo
  title: string;
  children: ReactNode;
};

export function SheetContent({ title, children }: SheetContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
      <Dialog.Content
        aria-describedby={undefined}
        className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col gap-2 bg-card p-2 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <Dialog.Title className="px-2 font-serif text-[1.375rem] leading-7 font-semibold">
            {title}
          </Dialog.Title>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Cerrar menú">
              <X aria-hidden="true" />
            </Button>
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
