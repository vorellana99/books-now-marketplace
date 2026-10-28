import { query, resetDatabase } from '../support/database.js';

// Este archivo y su par (isolation-a.spec.ts) escriben en la misma tabla.
// Si Vitest los ejecutara a la vez, el vaciado de uno borraría los datos del otro y esta prueba fallaría.
describe('aislamiento entre archivos de integración (b)', () => {
  beforeEach(resetDatabase);

  it('solo ve los datos que insertó este archivo', async () => {
    await query(
      `INSERT INTO catalog.books (isbn, title, author, price, currency, active)
       VALUES ('9780306406140', 'Libro b', 'Autor', 10, 'PEN', true)`,
    );

    await new Promise((resolve) => setTimeout(resolve, 600)); // da tiempo a que el otro archivo actúe

    const rows = await query<{ isbn: string }>(
      'SELECT isbn FROM catalog.books',
    );
    expect(rows.map((r) => r.isbn)).toEqual(['9780306406140']);
  });
});
