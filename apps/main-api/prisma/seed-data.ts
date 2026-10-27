// Datos de ejemplo para probar la API a mano. Los títulos y autores son reales; los precios y el stock, inventados.
// Cubren los casos del dominio: libros en PEN y en USD, uno inactivo, uno agotado y uno sin registro de stock

export interface SeedCustomer {
  id: string;
  email: string;
  premium: boolean;
}

export interface SeedBook {
  isbn: string;
  title: string;
  author: string;
  price: string; // texto: nunca number
  currency: 'PEN' | 'USD';
  active: boolean;
}

export interface SeedStock {
  isbn: string;
  available: number;
  reserved: number;
}

// Ids fijos para poder usarlos como `customerId` en las peticiones de prueba
export const CUSTOMERS: SeedCustomer[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'ana@example.com',
    premium: false,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'luis@example.com',
    premium: true,
  },
];

export const BOOKS: SeedBook[] = [
  {
    isbn: '9780132350884',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    price: '45.00',
    currency: 'PEN',
    active: true,
  },
  {
    isbn: '9780321125217',
    title: 'Domain-Driven Design',
    author: 'Eric Evans',
    price: '120.00',
    currency: 'PEN',
    active: true,
  },
  {
    isbn: '9780135957059',
    title: 'The Pragmatic Programmer',
    author: 'Andrew Hunt, David Thomas',
    price: '15.00',
    currency: 'USD',
    active: true,
  },
  {
    isbn: '9780134757599',
    title: 'Refactoring',
    author: 'Martin Fowler',
    price: '22.50',
    currency: 'USD',
    active: true,
  }, // agotado
  {
    isbn: '9780201633610',
    title: 'Design Patterns',
    author: 'Erich Gamma y otros',
    price: '95.00',
    currency: 'PEN',
    active: false,
  }, // inactivo
  {
    isbn: '9780735619678',
    title: 'Code Complete',
    author: 'Steve McConnell',
    price: '85.00',
    currency: 'PEN',
    active: true,
  }, // sin registro de stock
];

// Code Complete no figura aquí a propósito: es el caso "el libro existe en el catálogo pero no tiene stock registrado"
export const STOCK: SeedStock[] = [
  { isbn: '9780132350884', available: 25, reserved: 0 },
  { isbn: '9780321125217', available: 8, reserved: 0 },
  { isbn: '9780135957059', available: 40, reserved: 0 },
  { isbn: '9780134757599', available: 0, reserved: 0 },
  { isbn: '9780201633610', available: 5, reserved: 0 },
];
