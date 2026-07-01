import { Router } from "express";
import { z } from "zod";
import { Role } from "@ordercheck/shared";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const locationsRouter = Router();
locationsRouter.use(requireAuth);

locationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const locations = await prisma.location.findMany({ where: { organizationId: req.auth!.organizationId } });
    res.json(locations);
  }),
);

const createLocationSchema = z.object({ name: z.string().min(1), timezone: z.string().default("UTC") });

locationsRouter.post(
  "/",
  requireRole(Role.OWNER, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = createLocationSchema.parse(req.body);
    const location = await prisma.location.create({
      data: { ...input, organizationId: req.auth!.organizationId },
    });
    res.status(201).json(location);
  }),
);
