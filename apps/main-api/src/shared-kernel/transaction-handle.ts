declare const transactionBrand: unique symbol;

// Un identificador opaco de una transacción de la base de datos que ya está abierta. Los puertos lo reciben (`tx?`) para
// que una operación se una a una transacción que otro abrió (el relay del Outbox, por ejemplo), sin que el dominio ni
// `application/` sepan qué tecnología hay detrás. Solo se crea y se abre en `platform/prisma`
export type TransactionHandle = { readonly [transactionBrand]: true };
