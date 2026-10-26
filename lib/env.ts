import { z } from "zod";

/**
 * Public environment configuration.
 *
 * Phase 0 must run and build with zero environment variables. Only optional,
 * public values belong here. Server-only secrets must be read from a
 * server-only module (for example `lib/env.server.ts`) once a backend exists,
 * and must never use the `NEXT_PUBLIC_` prefix.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
});

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid public environment configuration — ${details}`);
}

export const env = {
  appUrl: parsed.data.NEXT_PUBLIC_APP_URL,
} as const;
