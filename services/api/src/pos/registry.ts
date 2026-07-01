import { POSProvider, type POSAdapter } from "@ordercheck/shared";
import { createMockAdapter } from "./adapters/mock.js";
import { createSquareAdapter } from "./adapters/square.js";

export function getPOSAdapter(provider: POSProvider, notificationUrl: string): POSAdapter {
  switch (provider) {
    case POSProvider.SQUARE:
      return createSquareAdapter(notificationUrl);
    case POSProvider.MOCK:
      return createMockAdapter();
    case POSProvider.TOAST:
    case POSProvider.CLOVER:
      throw new Error(`POS provider ${provider} is not yet implemented`);
    default:
      throw new Error(`Unknown POS provider: ${provider satisfies never}`);
  }
}
