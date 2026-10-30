import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRouter, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { isApiError } from "@/shared/api/errors.ts";
import { Alert } from "@/shared/ui/alert.tsx";
import { Button } from "@/shared/ui/button.tsx";
import { TextField } from "@/shared/ui/text-field.tsx";
import { login, register } from "../api.ts";
import { PasswordField } from "../components/password-field.tsx";
import { accountErrorMessage } from "../errors.ts";
import { safeReturnTo } from "../return-to.ts";
import { PASSWORD_MIN, registerSchema, type RegisterValues } from "../schemas.ts";
import { session } from "../session.ts";

// PA-03 · Registrarse (HU-01). La API no inicia sesión al crear la cuenta: se entra enseguida con las mismas credenciales
// (DP-11), y si eso falla se va a PA-04 con el correo ya escrito
export function RegisterPage() {
  const search = useSearch({ from: "/registro" });
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const returnTo = safeReturnTo(search.returnTo);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "" },
    // La contraseña corta se avisa al salir del campo, antes de enviar; el servidor decide siempre
    mode: "onTouched",
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setEmailTaken(false);
    try {
      await register(values);
    } catch (failure) {
      const code = isApiError(failure) ? failure.errorCode : undefined;
      if (code === "EMAIL_ALREADY_REGISTERED") {
        setEmailTaken(true);
        form.setError("email", { type: "server", message: "Ya existe una cuenta con ese correo." });
        form.setFocus("email");
      } else if (code === "INVALID_EMAIL") {
        form.setError("email", { type: "server", message: "Escribe un correo válido." });
        form.setFocus("email");
      } else if (code === "WEAK_PASSWORD") {
        form.setError("password", {
          type: "server",
          message:
            "Elige una contraseña más segura: al menos 10 caracteres y que no sea una de las más comunes.",
        });
        form.setFocus("password");
      } else {
        setError(accountErrorMessage(failure));
      }
      return;
    }
    // La cuenta existe. Si el inicio de sesión automático falla, se pide entrar a mano con el correo ya escrito
    try {
      session.start(await login(values));
      router.history.push(returnTo ?? "/");
    } catch {
      await router.navigate({
        to: "/ingresar",
        search: { aviso: "creada", correo: values.email, ...(returnTo ? { returnTo } : {}) },
      });
    }
  });

  return (
    <>
      <title>Crear cuenta · LibroYa</title>
      <div className="mx-auto flex w-full max-w-[400px] flex-col gap-4">
        <h1>Crea tu cuenta</h1>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <TextField
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            error={
              emailTaken ? (
                <>
                  {errors.email?.message}{" "}
                  <Link
                    to="/ingresar"
                    search={{
                      correo: form.getValues("email").trim(),
                      ...(returnTo ? { returnTo } : {}),
                    }}
                    className="font-medium text-primary underline"
                  >
                    ¿Quieres entrar?
                  </Link>
                </>
              ) : (
                errors.email?.message
              )
            }
            {...form.register("email", { onChange: () => setEmailTaken(false) })}
          />
          <PasswordField
            autoComplete="new-password"
            hint={`Al menos ${PASSWORD_MIN} caracteres.`}
            error={errors.password?.message}
            {...form.register("password")}
          />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Creando tu cuenta…" : "Crear cuenta"}
          </Button>
        </form>
        <p className="text-center">
          ¿Ya tienes cuenta?{" "}
          <Link
            to="/ingresar"
            search={returnTo ? { returnTo } : {}}
            className="font-medium text-primary hover:underline"
          >
            Entra
          </Link>
        </p>
      </div>
    </>
  );
}
