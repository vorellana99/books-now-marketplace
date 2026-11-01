import { cn } from "@/shared/lib/cn.ts";

export type CoverSize = "sm" | "md" | "lg";

// Tonos completos para que Tailwind los encuentre al leer el código
const TONES = [
  "bg-cover-1",
  "bg-cover-2",
  "bg-cover-3",
  "bg-cover-4",
  "bg-cover-5",
  "bg-cover-6",
] as const;

// Relación 2:3. Tamaños de docs/product/diseno/02-componentes.md: 56×84, 96×144 y 160×240
const SIZES: Record<CoverSize, string> = {
  sm: "w-14 p-1.5 text-[0.6875rem] leading-tight",
  md: "w-24 p-2 text-sm leading-snug",
  lg: "w-40 p-3 text-xl leading-snug",
};

// El color se elige a partir del ISBN: el mismo libro siempre tiene el mismo color (y hay seis)
export function coverToneOf(isbn: string): number {
  let hash = 7;
  for (const char of isbn) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % TONES.length;
}

// Sustituye a la imagen de portada mientras la API no la entregue (DP-05). Es decorativa: el título y el autor ya están
// en el texto de al lado, así que un lector de pantalla no los repite
export function BookCover({
  isbn,
  title,
  author,
  size = "md",
  className,
}: {
  isbn: string;
  title: string;
  author: string;
  size?: CoverSize;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-size={size}
      className={cn(
        "relative flex aspect-[2/3] shrink-0 flex-col justify-between overflow-hidden rounded-md text-white",
        TONES[coverToneOf(isbn)],
        SIZES[size],
        className,
      )}
    >
      {/* El filo claro de la izquierda sugiere el lomo */}
      <span className="absolute inset-y-0 left-0 w-1 bg-white/25" />
      <b className="line-clamp-3 pl-1.5 font-serif font-semibold">{title}</b>
      {size === "sm" ? null : <span className="pl-1.5 text-[0.6875rem] opacity-90">{author}</span>}
    </div>
  );
}
