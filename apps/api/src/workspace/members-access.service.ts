import {
	canChangeRole,
	MAILBOX_PROVIDER_IDS,
	normalizeAccessEmail,
	WORKSPACE_ID,
	workspaceRoleOf,
} from "@crm/auth";
import type { Db } from "@crm/db";
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { AddMemberInput, WorkspaceInvite } from "./workspace.contracts";

function inviteRole(value: string): WorkspaceInvite["role"] {
	return value === "admin" ? "admin" : "member";
}

@Injectable()
export class MembersAccessService {
	private readonly logger = new Logger(MembersAccessService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async invites(): Promise<WorkspaceInvite[]> {
		const [invites, members] = await Promise.all([
			this.db.workspaceAccess.findMany({
				orderBy: { createdAt: "desc" },
				select: {
					email: true,
					role: true,
					createdAt: true,
					invitedBy: { select: { name: true } },
				},
			}),
			this.db.member.findMany({
				where: { organizationId: WORKSPACE_ID },
				select: { user: { select: { email: true } } },
			}),
		]);

		const joined = new Set(
			members.map((member) => normalizeAccessEmail(member.user.email)),
		);

		return invites
			.filter((invite) => !joined.has(invite.email))
			.map((invite) => ({
				email: invite.email,
				role: inviteRole(invite.role),
				invitedAt: invite.createdAt.toISOString(),
				invitedBy: invite.invitedBy?.name ?? null,
			}));
	}

	async addMember(
		actingUserId: string,
		input: AddMemberInput,
	): Promise<WorkspaceInvite> {
		await this.requireManager(actingUserId);
		const email = normalizeAccessEmail(input.email);

		const existing = await this.db.member.findFirst({
			where: {
				organizationId: WORKSPACE_ID,
				user: { email: { equals: email, mode: "insensitive" } },
			},
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException(`${email} is already a member.`);
		}

		const invite = await this.db.$transaction(async (tx) => {
			await tx.workspaceRemoval.deleteMany({ where: { email } });
			return tx.workspaceAccess.upsert({
				where: { email },
				create: { email, role: input.role, invitedById: actingUserId },
				update: { role: input.role, invitedById: actingUserId },
				select: {
					email: true,
					role: true,
					createdAt: true,
					invitedBy: { select: { name: true } },
				},
			});
		});

		this.logger.log({
			message: "Member invited",
			role: input.role,
			userId: actingUserId,
		});

		return {
			email: invite.email,
			role: inviteRole(invite.role),
			invitedAt: invite.createdAt.toISOString(),
			invitedBy: invite.invitedBy?.name ?? null,
		};
	}

	async cancelInvite(
		actingUserId: string,
		emailInput: string,
	): Promise<{ email: string }> {
		await this.requireManager(actingUserId);
		const email = normalizeAccessEmail(emailInput);

		const { count } = await this.db.workspaceAccess.deleteMany({
			where: { email },
		});
		if (count === 0) throw new NotFoundException("There is no such invite.");

		this.logger.log({ message: "Invite cancelled", userId: actingUserId });

		return { email };
	}

	async removeMember(
		actingUserId: string,
		memberId: string,
	): Promise<{ memberId: string; email: string }> {
		await this.requireManager(actingUserId);

		const removed = await this.db.$transaction(async (tx) => {
			const target = await tx.member.findFirst({
				where: { id: memberId, organizationId: WORKSPACE_ID },
				select: {
					id: true,
					role: true,
					userId: true,
					user: { select: { email: true } },
				},
			});
			if (!target) {
				throw new NotFoundException("That person is not in this workspace.");
			}
			if (target.userId === actingUserId) {
				throw new ForbiddenException(
					"You cannot remove yourself. Ask another owner or admin.",
				);
			}

			if (target.role === "owner") {
				const owners = await tx.$queryRaw<{ id: string }[]>`
					SELECT id FROM "member"
					WHERE "organizationId" = ${WORKSPACE_ID} AND role = 'owner'
					FOR UPDATE
				`;
				if (owners.length <= 1) {
					throw new ForbiddenException(
						"The workspace needs an owner. Make someone else an owner first.",
					);
				}
			}

			const email = normalizeAccessEmail(target.user.email);

			await tx.member.delete({ where: { id: target.id } });
			await tx.session.deleteMany({ where: { userId: target.userId } });
			await tx.apikey.deleteMany({ where: { referenceId: target.userId } });
			await tx.mailboxSync.deleteMany({ where: { userId: target.userId } });
			await tx.account.deleteMany({
				where: {
					userId: target.userId,
					providerId: { in: [...MAILBOX_PROVIDER_IDS] },
				},
			});
			await tx.workspaceAccess.deleteMany({ where: { email } });
			await tx.workspaceRemoval.upsert({
				where: { email },
				create: { email, removedById: actingUserId },
				update: { removedById: actingUserId },
			});

			return { memberId: target.id, email };
		});

		this.logger.log({
			message: "Member removed",
			memberId: removed.memberId,
			userId: actingUserId,
		});

		return removed;
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canChangeRole(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only an owner or an admin can add or remove members.",
			);
		}
	}
}
