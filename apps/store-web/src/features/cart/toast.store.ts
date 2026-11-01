import { createStore } from "zustand/vanilla";

// Avisos breves del carrito («Libro agregado» con «Deshacer», «Quitado del carrito»…). Duran al menos 6 segundos, se
// detienen al pasar el cursor o enfocarlos, y nada crítico va solo en uno de ellos (docs/product/diseno/02-componentes.md)
export const TOAST_MS = 6000;

export type Toast = {
  tone: "success" | "warning";
  message: string;
  action?: { label: string; run: () => void };
};

type ToastState = { toast: (Toast & { id: number }) | null };

export const toastStore = createStore<ToastState>(() => ({ toast: null }));

let counter = 0;

// Un aviso nuevo reemplaza al anterior y reinicia la cuenta
export function showToast(toast: Toast): void {
  counter += 1;
  toastStore.setState({ toast: { ...toast, id: counter } });
}

export function dismissToast(): void {
  toastStore.setState({ toast: null });
}
