import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRouter, useSearch } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/shared/ui/alert.tsx";
import { Button } from "@/shared/ui/button.tsx";
import { TextField } from "@/shared/ui/text-field.tsx";
import { login } from "../api.ts";
import { accountErrorMessage } from "../errors.ts";
import { safeReturnTo } from "../return-to.ts";
import { loginSchema, type LoginValues } from "../schemas.ts";
import { session } from "../session.ts";

// PA-04 · Iniciar sesión (HU-02). Tras entrar vuelve a `returnTo` (si es una ruta interna) o al catálogo
export function LoginPage() {
  const search = useSearch({ from: "/ingresar" });
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El aviso de «tu sesión terminó» se muestra una sola vez: se toma del estado de la sesión y se descarta
  const expired = useSessionNotice();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: search.correo ?? "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      session.start(await login(values));
      router.history.push(safeReturnTo(search.returnTo) ?? "/");
    } catch (failure) {
      setError(accountErrorMessage(failure));
      // La contraseña no se conserva: se vuelve a escribir, y el foco va a ella
      form.resetField("password");
      form.setFocus("password");
    }
  });

  return (
    <>
      <title>Entrar · LibroYa</title>
      <div className="mx-auto flex w-full max-w-[400px] flex-col gap-4">
        {expired ? (
          <Alert variant="info">Tu sesión terminó. Entra de nuevo para continuar.</Alert>
        ) : null}
        {search.aviso === "carrito" ? (
          <Alert variant="info">Entra para armar tu carrito.</Alert>
        ) : null}
        {search.aviso === "creada" ? (
          <Alert variant="info">Cuenta creada. Entra para continuar.</Alert>
        ) : null}
        <h1>Entra a tu cuenta</h1>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <TextField
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...form.register("email")}
          />
          <TextField
            label="Contraseña"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            error={errors.password?.message}
            endAdornment={
              <button
                type="button"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((shown) => !shown)}
                className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-accent"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="size-5" />
                ) : (
                  <Eye aria-hidden="true" className="size-5" />
                )}
              </button>
            }
            {...form.register("password")}
          />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Entrando…" : "Entrar"}
          </Button>
        </form>
        <p className="text-center">
          ¿No tienes cuenta?{" "}
          <Link to="/registro" className="font-medium text-primary hover:underline">
            Crea una
          </Link>
        </p>
      </div>
    </>
  );
}

// Devuelve `true` si la sesión terminó sola mientras esta pantalla estaba abierta (o justo antes) y descarta el aviso
function useSessionNotice(): boolean {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const check = () => {
      if (session.getState().notice === "expired") {
        setExpired(true);
        session.dismissNotice();
      }
    };
    check();
    return session.store.subscribe(check);
  }, []);
  return expired;
}
