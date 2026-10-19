import { db } from "@crm/db";

export const INVITABLE_ROLES = ["member", "admin"] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const REMOVED_MESSAGE =
	"Your access to this CRM was removed. Ask an owner or an admin to add you again.";

export function normalizeAccessEmail(email: string | null | undefined): string {
	return email?.trim().toLowerCase() ?? "";
}

function toInvitableRole(value: string | null | undefined): InvitableRole {
	return value === "admin" ? "admin" : "member";
}

export type SignInAccess = {
	invited: boolean;
	removed: boolean;
	role: InvitableRole;
};

export async function signInAccess(
	email: string | null | undefined,
): Promise<SignInAccess> {
	const address = normalizeAccessEmail(email);
	if (!address) return { invited: false, removed: false, role: "member" };

	const [invite, removal] = await Promise.all([
		db.workspaceAccess.findUnique({
			where: { email: address },
			select: { role: true },
		}),
		db.workspaceRemoval.findUnique({
			where: { email: address },
			select: { email: true },
		}),
	]);

	return {
		invited: invite !== null,
		removed: removal !== null,
		role: toInvitableRole(invite?.role),
	};
}

export async function isRemovedUser(userId: string): Promise<boolean> {
	try {
		const user = await db.user.findUnique({
			where: { id: userId },
			select: { email: true },
		});
		if (!user) return false;

		return (await signInAccess(user.email)).removed;
	} catch (error) {
		console.error(
			`[auth] could not check whether user ${userId} was removed; letting the sign-in continue`,
			error,
		);
		return false;
	}
}

export async function invitedRoleOf(userId: string): Promise<InvitableRole> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { email: true },
	});

	return (await signInAccess(user?.email)).role;
}
