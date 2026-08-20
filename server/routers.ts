import { COOKIE_NAME } from "../shared/const.js";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  personalProfile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const profile = await db.getPersonalProfile(ctx.user.id);
      return profile ?? { displayName: ctx.user.name ?? "Shooter", privacy: "private", isNew: true };
    }),
    save: protectedProcedure
      .input(z.object({ displayName: z.string().trim().min(1).max(80) }))
      .mutation(({ ctx, input }) => db.upsertPersonalProfile(ctx.user.id, input.displayName)),
    poses: protectedProcedure.query(({ ctx }) => db.listPersonalPoseAnalyses(ctx.user.id)),
    savePose: protectedProcedure
      .input(z.object({
        sourceLabel: z.string().trim().min(1).max(160),
        poseSpace: z.enum(["monocular_relative_pose", "calibrated_multi_view_3d"]),
        status: z.enum(["candidate", "rejected", "approved_private"]),
        poseJson: z.string().min(2).max(1_000_000),
        qualityJson: z.string().min(2).max(100_000),
      }))
      .mutation(({ ctx, input }) => db.savePersonalPoseAnalysis({ userId: ctx.user.id, ...input })),
    removePose: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.deletePersonalPoseAnalysis(ctx.user.id, input.id)),
  }),
});

export type AppRouter = typeof appRouter;
