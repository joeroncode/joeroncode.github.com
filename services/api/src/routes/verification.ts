import { Router } from "express";
import { OrderStatus, VerificationVerdict, verifyOrderSchema } from "@ordercheck/shared";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { saveVerificationImage } from "../services/storageService.js";
import { requestVisionVerification } from "../services/visionClient.js";

export const verificationRouter = Router({ mergeParams: true });
verificationRouter.use(requireAuth);

function statusForVerdict(verdict: VerificationVerdict): OrderStatus {
  switch (verdict) {
    case VerificationVerdict.MATCH:
      return OrderStatus.VERIFIED;
    case VerificationVerdict.PARTIAL_MATCH:
    case VerificationVerdict.NEEDS_REVIEW:
    case VerificationVerdict.MISMATCH:
      return OrderStatus.FLAGGED;
    default:
      return OrderStatus.FLAGGED;
  }
}

verificationRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = verifyOrderSchema.parse(req.body);

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
      include: { items: true },
    });
    if (!order) throw new HttpError(404, "Order not found");

    const imageUrl = await saveVerificationImage(order.id, input.imageBase64, input.mimeType);

    const visionResult = await requestVisionVerification({
      orderId: order.id,
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
      expectedItems: order.items.map((i: { id: string; name: string; quantity: number; modifiers: string[] }) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        modifiers: i.modifiers,
      })),
    });

    const [verification] = await prisma.$transaction([
      prisma.verificationEvent.create({
        data: {
          orderId: order.id,
          verdict: visionResult.verdict,
          confidence: visionResult.confidence,
          imageUrl,
          itemResults: visionResult.itemResults,
          summary: visionResult.summary,
          visionProvider: "claude-vision",
          reviewedByUserId: req.auth!.userId,
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { status: statusForVerdict(visionResult.verdict) },
      }),
    ]);

    res.status(201).json(verification);
  }),
);
