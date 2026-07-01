import { Router } from "express";
import { z } from "zod";
import { createOrderSchema, OrderStatus } from "@ordercheck/shared";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { verificationRouter } from "./verification.js";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

const listQuerySchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  locationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

ordersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const orders = await prisma.order.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        status: query.status,
        locationId: query.locationId,
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
    res.json(orders);
  }),
);

ordersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
      include: { items: true, verifications: { orderBy: { createdAt: "desc" } } },
    });
    if (!order) throw new HttpError(404, "Order not found");
    res.json(order);
  }),
);

ordersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createOrderSchema.parse(req.body);

    const location = await prisma.location.findFirst({
      where: { id: input.locationId, organizationId: req.auth!.organizationId },
    });
    if (!location) throw new HttpError(404, "Location not found");

    const order = await prisma.order.create({
      data: {
        organizationId: req.auth!.organizationId,
        locationId: input.locationId,
        externalId: input.externalId,
        posProvider: input.posProvider,
        channel: input.channel,
        customerName: input.customerName,
        items: { create: input.items.map((i) => ({ ...i, menuItemId: i.menuItemId })) },
      },
      include: { items: true },
    });
    res.status(201).json(order);
  }),
);

const updateStatusSchema = z.object({ status: z.nativeEnum(OrderStatus) });

ordersRouter.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = updateStatusSchema.parse(req.body);

    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new HttpError(404, "Order not found");

    const order = await prisma.order.update({ where: { id: existing.id }, data: { status } });
    res.json(order);
  }),
);

ordersRouter.use("/:id/verify", verificationRouter);
