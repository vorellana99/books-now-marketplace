import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { cn } from "@/shared/lib/cn.ts";
import { Button } from "@/shared/ui/button.tsx";
import { dismissToast, TOAST_MS, toastStore } from "../toast.store.ts";

// Dibuja el aviso breve del carrito, abajo en la pantalla. La región educada (`aria-live`) existe siempre: un lector de
// pantalla anuncia lo que aparece en una región que ya estaba, no en una que nace con el texto
export function CartToaster() {
  const toast = useStore(toastStore, (state) => state.toast);
  // Mientras el cursor o el foco están encima, no se cuenta el tiempo
  const [held, setHeld] = useState(false);
  const id = toast?.id;

  useEffect(() => {
    if (id === undefined || held) return;
    const timer = setTimeout(dismissToast, TOAST_MS);
    return () => clearTimeout(timer);
  }, [id, held]);

  // Un aviso nuevo empieza sin estar sujeto
  useEffect(() => setHeld(false), [id]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-3"
    >
      {toast ? (
        <div
          role="status"
          aria-label="Aviso"
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          className={cn(
            "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md border p-3 text-sm shadow-md",
            toast.tone === "success"
              ? "border-success-border bg-success-bg text-success"
              : "border-warning-border bg-warning-bg text-warning",
          )}
        >
          <p className="flex-1">{toast.message}</p>
          {toast.action ? (
            <Button
              variant="ghost"
              className="h-9 px-2 text-current underline"
              onClick={() => {
                toast.action?.run();
                dismissToast();
              }}
            >
              {toast.action.label}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-current"
            aria-label="Cerrar aviso"
            onClick={dismissToast}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
