import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Une clases de Tailwind sin que se pisen entre sí (la última gana)
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
