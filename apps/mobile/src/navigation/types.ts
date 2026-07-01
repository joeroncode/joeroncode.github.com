import type { VerificationResultDTO } from "@ordercheck/shared";

export type RootStackParamList = {
  Login: undefined;
  OrderQueue: undefined;
  Verify: { orderId: string; orderLabel: string };
  Result: { result: VerificationResultDTO };
};
