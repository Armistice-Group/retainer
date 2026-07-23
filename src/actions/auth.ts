"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify, randomSuffix } from "@/lib/slug";
import { signupSchema, loginSchema, acceptInviteSchema } from "@/lib/validations/auth";
import { notify, getOrgAdminUserIds } from "@/lib/notifications";

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

async function uniqueOrgSlug(name: string) {
  const base = slugify(name) || "org";
  let slug = base;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${base}-${randomSuffix()}`;
  }
  return slug;
}

export async function signupAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    orgName: formData.get("orgName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { orgName, name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { fieldErrors: { email: ["An account with this email already exists."] } };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const slug = await uniqueOrgSlug(orgName);

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName, slug } });
    const user = await tx.user.create({ data: { name, email, passwordHash } });
    await tx.membership.create({
      data: { userId: user.id, orgId: org.id, role: "OWNER" },
    });
  });

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Try logging in." };
    }
    throw err;
  }

  return null;
}

export async function loginAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const callbackUrl = (formData.get("callbackUrl") as string) || "/dashboard";

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw err;
  }

  return null;
}

export async function acceptInviteAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = acceptInviteSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { token, name, password } = parsed.data;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return { error: "This invite link is invalid or has expired." };
  }
  if (!invite.email) {
    return { error: "This invite is missing an email address." };
  }

  const email = invite.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  let joined = false;

  if (user) {
    const alreadyMember = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: user.id, orgId: invite.orgId } },
    });
    if (!alreadyMember) {
      await prisma.membership.create({
        data: { userId: user.id, orgId: invite.orgId, role: invite.role },
      });
      joined = true;
    }
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    user = await prisma.user.create({
      data: { email, name, passwordHash },
    });
    await prisma.membership.create({
      data: { userId: user.id, orgId: invite.orgId, role: invite.role },
    });
    joined = true;
  }

  await prisma.invite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });

  if (joined) {
    const adminIds = await getOrgAdminUserIds(prisma, invite.orgId);
    await notify(prisma, {
      orgId: invite.orgId,
      userIds: adminIds,
      type: "MEMBER_JOINED",
      message: `${user.name} joined your organization.`,
      link: "/settings/members",
    });
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invite accepted. Please log in." };
    }
    throw err;
  }

  return null;
}

export async function createOrgAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgName = (formData.get("orgName") as string)?.trim();
  if (!orgName || orgName.length < 2) {
    return { fieldErrors: { orgName: ["Organization name is required"] } };
  }

  const slug = await uniqueOrgSlug(orgName);

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName, slug } });
    await tx.membership.create({
      data: { userId: session.user.id, orgId: org.id, role: "OWNER" },
    });
  });

  redirect("/dashboard");
}
