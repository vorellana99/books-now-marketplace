import { Isbn } from '../../../src/shared-kernel/isbn.vo.js';
import { uniqueIsbn } from '../../support/builders.js';

describe('uniqueIsbn (ayuda de los tests)', () => {
  it('genera ISBN válidos según el código de producción', () => {
    for (let i = 0; i < 200; i++) {
      const isbn = uniqueIsbn();
      expect(Isbn.create(isbn).value).toBe(isbn);
    }
  });

  it('no repite ISBN', () => {
    const isbns = Array.from({ length: 500 }, uniqueIsbn);
    expect(new Set(isbns).size).toBe(isbns.length);
  });
});
