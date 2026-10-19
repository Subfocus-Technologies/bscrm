import { INVITABLE_ROLES, WORKSPACE_ROLES } from "@crm/auth";
import { MAX_SLUG } from "@crm/db/workspace";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const memberListInput = listInput.extend({
	role: z.array(z.string()).default([]),
});

export type MemberListInput = z.infer<typeof memberListInput>;

export const updateWorkspaceInput = z.object({
	name: z.string().trim().min(1).max(120),
	website: z.string().trim().min(1).max(255),
	slug: z
		.string()
		.trim()
		.min(1)
		.max(MAX_SLUG)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		.optional(),
});

export const setMemberRoleInput = z.object({
	memberId: z.string().min(1),
	role: z.enum(WORKSPACE_ROLES),
});

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInput>;
export type SetMemberRoleInput = z.infer<typeof setMemberRoleInput>;

export const workspaceOutput = z.object({
	id: z.string(),
	slug: z.string(),
	name: z.string(),
	website: z.string().nullable(),
	onboarded: z.boolean(),
	viewerRole: z.enum(WORKSPACE_ROLES).nullable(),
	canRename: z.boolean(),
	canChangeRoles: z.boolean(),
});

export type Workspace = z.infer<typeof workspaceOutput>;

export const workspaceMemberOutput = z.object({
	id: z.string(),
	userId: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
	role: z.enum(WORKSPACE_ROLES),
	joinedAt: z.string(),
	isViewer: z.boolean(),
});

export type WorkspaceMember = z.infer<typeof workspaceMemberOutput>;

export const memberListOutput = z.object({
	rows: z.array(workspaceMemberOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
});

export const addMemberInput = z.object({
	email: z.email("That is not an email address."),
	role: z.enum(INVITABLE_ROLES).default("member"),
});

export type AddMemberInput = z.infer<typeof addMemberInput>;

export const inviteOutput = z.object({
	email: z.string(),
	role: z.enum(INVITABLE_ROLES),
	invitedAt: z.string(),
	invitedBy: z.string().nullable(),
});

export type WorkspaceInvite = z.infer<typeof inviteOutput>;

export const inviteListOutput = z.array(inviteOutput);

export const cancelInviteInput = z.object({ email: z.string() });

export const cancelInviteOutput = z.object({ email: z.string() });

export const removeMemberInput = z.object({ memberId: z.string() });

export const removeMemberOutput = z.object({
	memberId: z.string(),
	email: z.string(),
});
