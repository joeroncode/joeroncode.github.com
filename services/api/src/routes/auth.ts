import { Router } from "express";
import { loginSchema, registerSchema, Role } from "@ordercheck/shared";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { hashPassword, signAccessToken, verifyPassword } from "../services/authService.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);

    const existing = await prisma.user.findFirst({ where: { email: input.email } });
    if (existing) {
      throw new HttpError(409, "An account with that email already exists");
    }

    const passwordHash = await hashPassword(input.password);

    const organization = await prisma.organization.create({
      data: {
        name: input.organizationName,
        users: {
          create: { email: input.email, name: input.name, passwordHash, role: Role.OWNER },
        },
        locations: {
          create: { name: "Main Location" },
        },
      },
      include: { users: true },
    });

    const user = organization.users[0];
    const { token, expiresIn } = signAccessToken({ sub: user.id, organizationId: organization.id, role: user.role });
    res.status(201).json({ accessToken: token, expiresIn, user: { id: user.id, email: user.email, role: user.role } });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);

    const user = await prisma.user.findFirst({ where: { email: input.email } });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    const { token, expiresIn } = signAccessToken({
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });
    res.json({ accessToken: token, expiresIn, user: { id: user.id, email: user.email, role: user.role } });
  }),
);
