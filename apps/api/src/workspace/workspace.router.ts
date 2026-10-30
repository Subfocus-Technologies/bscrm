import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { MembersAccessService } from "./members-access.service";
import {
	addMemberInput,
	cancelInviteInput,
	cancelInviteOutput,
	inviteListOutput,
	inviteOutput,
	memberListInput,
	memberListOutput,
	removeMemberInput,
	removeMemberOutput,
	setDeveloperFolderInput,
	setMemberRoleInput,
	updateWorkspaceInput,
	workspaceMemberOutput,
	workspaceOutput,
} from "./workspace.contracts";
import { WorkspaceService } from "./workspace.service";

@Router({ alias: "workspace" })
@UseMiddlewares(AuthMiddleware)
export class WorkspaceRouter {
	constructor(
		@Inject(WorkspaceService) private readonly workspace: WorkspaceService,
		@Inject(MembersAccessService)
		private readonly access: MembersAccessService,
	) {}

	@Query({
		output: workspaceOutput,
		meta: restMeta("GET", "/workspace", ["Workspace"]),
	})
	async get(@Ctx() ctx: AuthedTrpcContext) {
		return this.workspace.get(ctx.user.id);
	}

	@Mutation({
		input: setDeveloperFolderInput,
		output: workspaceOutput,
		meta: restMeta("PATCH", "/workspace/developer-folder", ["Workspace"]),
	})
	async setDeveloperFolder(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setDeveloperFolderInput>,
	) {
		return this.workspace.setDeveloperFolder(ctx.user.id, input);
	}

	@Query({
		input: memberListInput,
		output: memberListOutput,
		meta: restMeta("POST", "/workspace/members/search", ["Workspace"]),
	})
	async members(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof memberListInput>,
	) {
		return this.workspace.members(ctx.user.id, input);
	}

	@Mutation({
		input: updateWorkspaceInput,
		output: workspaceOutput,
		meta: restMeta("PATCH", "/workspace", ["Workspace"]),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateWorkspaceInput>,
	) {
		return this.workspace.update(ctx.user.id, input);
	}

	@Mutation({
		input: setMemberRoleInput,
		output: workspaceMemberOutput,
		meta: restMeta("PATCH", "/workspace/members/{memberId}/role", [
			"Workspace",
		]),
	})
	async setMemberRole(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setMemberRoleInput>,
	) {
		return this.workspace.setMemberRole(ctx.user.id, input);
	}

	@Query({
		output: inviteListOutput,
		meta: restMeta("GET", "/workspace/invites", ["Workspace"]),
	})
	async invites() {
		return this.access.invites();
	}

	@Mutation({
		input: addMemberInput,
		output: inviteOutput,
		meta: restMeta("POST", "/workspace/invites", ["Workspace"]),
	})
	async addMember(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof addMemberInput>,
	) {
		return this.access.addMember(ctx.user.id, input);
	}

	@Mutation({
		input: cancelInviteInput,
		output: cancelInviteOutput,
		meta: restMeta("DELETE", "/workspace/invites/{email}", ["Workspace"]),
	})
	async cancelInvite(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("email") email: string,
	) {
		return this.access.cancelInvite(ctx.user.id, email);
	}

	@Mutation({
		input: removeMemberInput,
		output: removeMemberOutput,
		meta: restMeta("DELETE", "/workspace/members/{memberId}", ["Workspace"]),
	})
	async removeMember(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("memberId") memberId: string,
	) {
		return this.access.removeMember(ctx.user.id, memberId);
	}
}
