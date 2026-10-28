// Los roles de un usuario autenticado. Los usan Identidad (quién es quién) y la plataforma (los guards de las rutas)
export type Role = 'BUYER' | 'ADMIN';
export const ROLES: readonly Role[] = ['BUYER', 'ADMIN'];
