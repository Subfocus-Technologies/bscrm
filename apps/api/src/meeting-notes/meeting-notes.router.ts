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
import { IncomingNotesService } from "./incoming-notes.service";
import {
	followUpDecideInput,
	followUpDecideOutput,
	followUpsInput,
	followUpsOutput,
	incomingNoteFileInput,
	incomingNoteFileOutput,
	incomingNoteIdInput,
	incomingNoteStatusOutput,
	incomingNotesInput,
	incomingNotesOutput,
	meetingNotesImportInput,
	meetingNotesImportOutput,
	rereadOutput,
} from "./meeting-notes.contracts";
import { MeetingNotesService } from "./meeting-notes.service";

@Router({ alias: "meetingNotes" })
@UseMiddlewares(AuthMiddleware)
export class MeetingNotesRouter {
	constructor(
		@Inject(MeetingNotesService) private readonly notes: MeetingNotesService,
		@Inject(IncomingNotesService)
		private readonly incoming: IncomingNotesService,
	) {}

	@Mutation({
		input: meetingNotesImportInput,
		output: meetingNotesImportOutput,
		meta: restMeta("POST", "/meeting-notes", ["Meeting notes"]),
	})
	async import(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof meetingNotesImportInput>,
	) {
		return this.notes.importNotes(input, ctx.user.id);
	}

	@Query({
		input: followUpsInput,
		output: followUpsOutput,
		meta: restMeta("GET", "/meeting-notes/{activityId}/follow-ups", [
			"Meeting notes",
		]),
	})
	async followUps(@Input("activityId") activityId: string) {
		return this.notes.followUps(activityId);
	}

	@Mutation({
		input: followUpDecideInput,
		output: followUpDecideOutput,
		meta: restMeta("POST", "/meeting-notes/follow-ups/{id}/decide", [
			"Meeting notes",
		]),
	})
	async decide(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof followUpDecideInput>,
	) {
		return this.notes.decide(input, ctx.user.id);
	}

	@Mutation({
		input: followUpsInput,
		output: rereadOutput,
		meta: restMeta("POST", "/meeting-notes/{activityId}/reread", [
			"Meeting notes",
		]),
	})
	async reread(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("activityId") activityId: string,
	) {
		return this.notes.reread(activityId, ctx.user.id);
	}

	@Query({
		input: incomingNotesInput,
		output: incomingNotesOutput,
		meta: restMeta("GET", "/meeting-notes/inbox", ["Meeting notes"]),
	})
	async inbox(@Input() input: z.infer<typeof incomingNotesInput>) {
		return this.incoming.list(input);
	}

	@Mutation({
		input: incomingNoteFileInput,
		output: incomingNoteFileOutput,
		meta: restMeta("POST", "/meeting-notes/inbox/{id}/file", ["Meeting notes"]),
	})
	async file(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof incomingNoteFileInput>,
	) {
		return this.incoming.file(input, ctx.user.id);
	}

	@Mutation({
		input: incomingNoteIdInput,
		output: incomingNoteStatusOutput,
		meta: restMeta("POST", "/meeting-notes/inbox/{id}/ignore", [
			"Meeting notes",
		]),
	})
	async ignore(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.incoming.setIgnored(id, true, ctx.user.id);
	}

	@Mutation({
		input: incomingNoteIdInput,
		output: incomingNoteStatusOutput,
		meta: restMeta("POST", "/meeting-notes/inbox/{id}/restore", [
			"Meeting notes",
		]),
	})
	async restore(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.incoming.setIgnored(id, false, ctx.user.id);
	}
}
