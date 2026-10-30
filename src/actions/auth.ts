"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE, sessionHours, signSession } from "@/lib/session-token";
import { requireUser } from "@/lib/auth";
import { fail, formObject, success, zodFail, type ActionState } from "@/lib/action-result";
import { changePasswordSchema } from "@/lib/validators";
import { audit } from "@/lib/audit";

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { username, password, next } = formObject(formData);
  if (!username || !password) return fail("Enter your username and password.");

  const user = await db.user.findUnique({ where: { username: username.toLowerCase() } });
  // Compare even when the user is missing to keep response time constant
  const ok = await bcrypt.compare(password, user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!user || !ok) return fail("Incorrect username or password.");
  if (!user.isActive) return fail("This account is disabled. Contact your administrator.");

  const token = await signSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionHours() * 3600,
  });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(user.id, "auth.login", "User", user.id);

  const target = user.mustChangePassword
    ? "/profile?first=1"
    : next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
  // ?welcome triggers the deadline alert once after sign-in
  redirect(target.includes("?") ? `${target}&welcome=1` : `${target}?welcome=1`);
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  const parsed = changePasswordSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);

  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) {
    return fail("Current password is incorrect.", { current: "Incorrect password" });
  }
  await db.user.update({
    where: { id: me.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10), mustChangePassword: false },
  });
  await audit(me.id, "auth.password.change", "User", me.id);
  return success("Password updated.");
}
