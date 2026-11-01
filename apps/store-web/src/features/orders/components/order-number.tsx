import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { orderNumber } from "../order-number.ts";

const COPIED_MS = 2000;

// El número corto del pedido, con un botón que copia el `id` completo (el que sirve para pedir ayuda)
// `showNumber={false}` deja solo el botón, cuando el número ya está en un título
export function OrderNumber({ id, showNumber = true }: { id: string; showNumber?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      return; // sin permiso del navegador no hay nada que avisar: el número corto sigue a la vista
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <span className="inline-flex items-center gap-2">
      {showNumber ? <span className="money font-semibold">{orderNumber(id)}</span> : null}
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copiar el número de pedido completo"
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:underline"
      >
        {copied ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Copy aria-hidden="true" className="size-4" />
        )}
        <span aria-live="polite">{copied ? "Copiado" : "Copiar"}</span>
      </button>
    </span>
  );
}
