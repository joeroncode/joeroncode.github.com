import crypto from "node:crypto";
import { Router } from "express";
import { posConnectSchema, Role } from "@ordercheck/shared";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";

export const posIntegrationsRouter = Router();
posIntegrationsRouter.use(requireAuth);

posIntegrationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const integrations = await prisma.pOSIntegration.findMany({
      where: { organizationId: req.auth!.organizationId },
      select: {
        id: true,
        provider: true,
        locationId: true,
        externalLocationId: true,
        isActive: true,
        createdAt: true,
      },
    });
    res.json(integrations);
  }),
);

posIntegrationsRouter.post(
  "/",
  requireRole(Role.OWNER, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = posConnectSchema.parse(req.body);

    const location = await prisma.location.findFirst({
      where: { id: input.locationId, organizationId: req.auth!.organizationId },
    });
    if (!location) throw new HttpError(404, "Location not found");

    const webhookSecret = input.webhookSecret ?? crypto.randomBytes(24).toString("hex");

    const integration = await prisma.pOSIntegration.upsert({
      where: { locationId_provider: { locationId: input.locationId, provider: input.provider } },
      create: {
        organizationId: req.auth!.organizationId,
        locationId: input.locationId,
        provider: input.provider,
        accessToken: input.accessToken,
        webhookSecret,
      },
      update: { accessToken: input.accessToken, webhookSecret, isActive: true },
    });

    res.status(201).json({
      id: integration.id,
      provider: integration.provider,
      locationId: integration.locationId,
      webhookUrl: `/webhooks/pos/${integration.provider.toLowerCase()}/${integration.locationId}`,
      webhookSecret,
    });
  }),
);
