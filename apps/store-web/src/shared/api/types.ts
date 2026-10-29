// Los tipos de la API que usa el resto de la app. Las funcionalidades importan de aquí y nunca de `schema.d.ts`:
// si algún día cambia el generador de tipos, solo cambia este archivo.
import type { components, paths } from "./schema.d.ts";

export type { paths };

type Schemas = components["schemas"];

export type Money = Schemas["MoneyResponse"];
export type Book = Schemas["BookResponse"];
export type BookPage = Schemas["BookPageResponse"];
export type Order = Schemas["OrderDetailResponse"]; // GET /orders/:id: el pedido con su dirección (DP-15)
export type OrderLine = Schemas["OrderLineResponse"];
export type OrderHistoryItem = Schemas["OrderHistoryItemResponse"];
export type OrderHistoryPage = Schemas["OrderHistoryResponse"];
export type PlaceOrderBody = Schemas["PlaceOrderDto"];
export type PlaceOrderResult = Schemas["PlaceOrderResponse"];
export type ShippingAddress = Schemas["ShippingAddressDto"];
export type Credentials = Schemas["CredentialsDto"];
export type Session = Schemas["LoginResponse"];
export type User = Schemas["UserResponse"];
