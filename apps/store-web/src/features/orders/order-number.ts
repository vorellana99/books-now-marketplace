// El número de pedido que ve la persona: los primeros 8 caracteres del `id`, en mayúsculas (wireframe PA-07). El `id` completo
// es el que viaja a la API
export const orderNumber = (id: string): string => `#${id.slice(0, 8).toUpperCase()}`;
