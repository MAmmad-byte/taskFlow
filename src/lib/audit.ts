import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: Prisma.InputJsonValue,
) {
  try {
    await db.auditLog.create({ data: { actorId, action, entity, entityId: entityId ?? null, details } });
  } catch (e) {
    console.error("audit log failed", e);
  }
}

export async function notify(
  userIds: (string | null | undefined)[],
  data: { title: string; body?: string; link?: string },
  exceptUserId?: string,
) {
  const ids = [...new Set(userIds.filter((u): u is string => !!u && u !== exceptUserId))];
  if (!ids.length) return;
  await db.notification.createMany({ data: ids.map((userId) => ({ userId, ...data })) });
}
