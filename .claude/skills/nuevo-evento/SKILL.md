---
name: nuevo-evento
description: Lista de comprobación para publicar un evento entre contextos del backend con el Outbox (contrato, escritura en la misma transacción, consumidor, pruebas y documentos). Úsalo al hacer que un contexto reaccione a algo que ocurrió en otro.
---

# Un evento nuevo entre contextos

Los contextos no se importan entre sí: se hablan por `src/contracts/` y por eventos.

1. **Contrato** en `src/contracts/<contexto>/<nombre>.event.ts`, una clase que implementa `DomainEvent`: `eventName` (`contexto.entidad.accion`), `eventVersion`, `occurredOn` y `aggregateId` **como propiedad real**, no como getter (para que viaje en el JSON). Solo lo que otros necesitan; nunca secretos (contraseñas, hashes, tokens). Viaja como JSON.
2. **Escribirlo en la misma transacción que el cambio:** `await this.outbox.append(tx, [new MiEvento(...)])` dentro del `$transaction`. Guardados por separado, una caída dejaría el cambio sin su evento. Si nadie escucha aún el evento, `OutboxWriter` no lo guarda.
3. **Consumidor** en el contexto que reacciona, con `@OutboxHandler()` + `@Injectable()`, listado en `providers` de su módulo (se descubre solo):
   - `kind: 'db'` recibe `ctx.tx` y su efecto se confirma junto con la entrega: efecto único.
   - `kind: 'external'` es al-menos-una-vez y debe enviar `ctx.eventId` como clave de idempotencia.
4. **Idempotente y sin silencios:** repetir la entrega no debe pisar nada; lo que no cuadra **lanza un error** (el relay reintenta y acaba en `FAILED`, visible), no se omite en silencio (`skipDuplicates` esconde conflictos).
5. **Un consumidor solo recibe los eventos guardados después de desplegarlo.**
6. **Pruebas:** el contrato (forma del payload y que no lleva secretos), que el cambio y el evento se deshacen juntos (un outbox que falla antes y después de escribir; ver `register-user.handler.spec.ts`), el consumidor entregado directamente con un `tx` y por el relay (`relay.runOnce()`), la repetición, los errores, y la ventana entre el cambio y la entrega. Para ver el evento hace falta un consumidor: añade una **sonda** en `test/support/outbox-probes.ts`.
7. **Documentos:** `docs/backend/05-piezas-clave.md` si cambia el patrón, el árbol de `02-estructura…` y la bitácora.
8. Es crítico (transacciones): mutaciones sobre la atomicidad y la idempotencia (`/mutar`).
