import { BookOpen, CircleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn.ts";
import { Button } from "@/shared/ui/button.tsx";

type StatePanelProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  // Un botón o enlace con la acción que sigue
  action?: ReactNode;
  // Código para pedir ayuda: es el `X-Request-Id` de la petición que falló
  supportCode?: string | undefined;
  // El nivel del título depende de la pantalla: `h1` si el panel es toda la pantalla
  as?: "h1" | "h2" | "h3";
  className?: string;
};

// Los estados "vacío", "error" y "no encontrado" de toda pantalla con datos ([04-flujos-de-pantalla, sección 2])
export function StatePanel({
  icon: Icon = BookOpen,
  title,
  description,
  action,
  supportCode,
  as: Heading = "h2",
  className,
}: StatePanelProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-10 text-center", className)}>
      <div className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-7" />
      </div>
      <Heading className="text-[1.375rem] leading-7">{title}</Heading>
      {description ? <p className="max-w-[28ch] text-muted-foreground">{description}</p> : null}
      {action}
      {supportCode ? (
        <p className="text-sm text-muted-foreground">
          Código de soporte: <span className="money select-all">{supportCode}</span>
        </p>
      ) : null}
    </div>
  );
}

type EmptyStateProps = Omit<StatePanelProps, "icon"> & { icon?: LucideIcon };

export function EmptyState(props: EmptyStateProps) {
  return <StatePanel {...props} />;
}

type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  supportCode?: string | undefined;
  as?: "h1" | "h2" | "h3";
  className?: string;
};

export function ErrorState({
  title = "Algo salió mal",
  description = "Inténtalo de nuevo en unos minutos.",
  onRetry,
  supportCode,
  as,
  className,
}: ErrorStateProps) {
  return (
    <StatePanel
      icon={CircleAlert}
      title={title}
      description={description}
      supportCode={supportCode}
      {...(as ? { as } : {})}
      {...(className ? { className } : {})}
      action={onRetry ? <Button onClick={onRetry}>Reintentar</Button> : undefined}
    />
  );
}

export function NotFoundState(props: EmptyStateProps) {
  return <StatePanel {...props} />;
}
