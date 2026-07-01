import type { OrderChannel, OrderStatus, POSProvider, Role, VerificationVerdict } from "./enums.js";

export interface OrganizationDTO {
  id: string;
  name: string;
  createdAt: string;
}

export interface LocationDTO {
  id: string;
  organizationId: string;
  name: string;
  timezone: string;
}

export interface UserDTO {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: Role;
}

export interface MenuItemDTO {
  id: string;
  organizationId: string;
  posItemId: string | null;
  name: string;
  imageUrl: string | null;
  category: string | null;
}

export interface OrderItemDTO {
  id: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
  modifiers: string[];
  notes: string | null;
}

export interface OrderDTO {
  id: string;
  organizationId: string;
  locationId: string;
  externalId: string | null;
  posProvider: POSProvider;
  channel: OrderChannel;
  status: OrderStatus;
  customerName: string | null;
  items: OrderItemDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface VerificationItemResult {
  orderItemId: string;
  name: string;
  expectedQuantity: number;
  detectedQuantity: number;
  matched: boolean;
  notes: string | null;
}

export interface VerificationResultDTO {
  id: string;
  orderId: string;
  verdict: VerificationVerdict;
  confidence: number;
  imageUrl: string;
  itemResults: VerificationItemResult[];
  summary: string;
  createdAt: string;
  reviewedByUserId: string | null;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}
