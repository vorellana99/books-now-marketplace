import { z } from "zod";

// zod 4 compila sus validadores con `new Function` cuando puede, y para saberlo lo prueba al construir cada esquema: con una CSP
// sin `'unsafe-eval'` (la de `deploy/security-headers.conf`) esa prueba es una violación que el navegador reporta, aunque zod
// la atrape y siga. Se desactiva esa compilación: los esquemas de la tienda son pequeños y validan un puñado de campos.
//
// TODO el código importa `z` de AQUÍ y nunca de «zod» (lo comprueba `test/unit/zod-setup.test.ts`): así esta configuración se
// evalúa antes que cualquier esquema, sea cual sea el orden en que el empaquetador evalúe los módulos
z.config({ jitless: true });

export { z };
