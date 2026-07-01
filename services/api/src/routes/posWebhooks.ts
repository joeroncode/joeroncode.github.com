import express, { Router } from "express";
import { POSProvider } from "@ordercheck/shared";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { getPOSAdapter } from "../pos/registry.js";

export const posWebhooksRouter = Router();

posWebhooksRouter.post(
  "/:provider/:locationId",
  express.raw({ type: "*/*", limit: "2mb" }),
  asyncHandler(async (req, res) => {
    const provider = req.params.provider.toUpperCase() as POSProvider;
    if (!Object.values(POSProvider).includes(provider)) {
      throw new HttpError(400, `Unknown POS provider: ${req.params.provider}`);
    }

    const integration = await prisma.pOSIntegration.findFirst({
      where: { locationId: req.params.locationId, provider, isActive: true },
    });
    if (!integration?.webhookSecret) {
      throw new HttpError(404, "No active POS integration for this location");
    }

    const rawBody = (req.body as Buffer).toString("utf8");
    const notificationUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const adapter = getPOSAdapter(provider, notificationUrl);

    const signatureHeader =
      req.header("x-square-hmacsha256-signature") ?? req.header("x-ordercheck-signature") ?? undefined;
    const isValid = adapter.verifyWebhookSignature({
      rawBody,
      signatureHeader,
      secret: integration.webhookSecret,
    });
    if (!isValid) throw new HttpError(401, "Invalid webhook signature");

    const payload = JSON.parse(rawBody) as unknown;
    const normalized = adapter.parseWebhookOrder(payload);
    if (!normalized) {
      res.status(202).json({ status: "ignored", reason: "unrecognized payload shape" });
      return;
    }

    const order = await prisma.order.upsert({
      where: {
        locationId_posProvider_externalId: {
          locationId: integration.locationId,
          posProvider: provider,
          externalId: normalized.externalId,
        },
      },
      create: {
        organizationId: integration.organizationId,
        locationId: integration.locationId,
        externalId: normalized.externalId,
        posProvider: provider,
        channel: normalized.channel,
        customerName: normalized.customerName,
        items: {
          create: normalized.items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            modifiers: i.modifiers,
            notes: i.notes,
          })),
        },
      },
      update: {
        channel: normalized.channel,
        customerName: normalized.customerName,
      },
      include: { items: true },
    });

    res.status(200).json({ status: "ok", orderId: order.id });
  }),
);
