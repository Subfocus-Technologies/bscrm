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
import { NextMeetingsService } from "../google/next-meetings.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	nextMeetingsOutput,
	prepareMeetingInput,
	prepareMeetingOutput,
	upcomingMeetingsInput,
	upcomingMeetingsOutput,
} from "./meetings.contracts";
import { MeetingsService } from "./meetings.service";

@Router({ alias: "meetings" })
@UseMiddlewares(AuthMiddleware)
export class MeetingsRouter {
	constructor(
		@Inject(MeetingsService) private readonly meetings: MeetingsService,
		@Inject(NextMeetingsService) private readonly next: NextMeetingsService,
	) {}

	@Query({
		output: nextMeetingsOutput,
		meta: restMeta("GET", "/meetings/next", ["Meetings"]),
	})
	async mine(@Ctx() ctx: AuthedTrpcContext) {
		return this.next.forUser(ctx.user.id);
	}

	@Query({
		input: upcomingMeetingsInput,
		output: upcomingMeetingsOutput,
		meta: restMeta("GET", "/meetings/upcoming", ["Meetings"]),
	})
	async upcoming(@Input() input: z.infer<typeof upcomingMeetingsInput>) {
		return this.meetings.upcoming(input);
	}

	@Mutation({
		input: prepareMeetingInput,
		output: prepareMeetingOutput,
		meta: restMeta("POST", "/meetings/{eventId}/prepare", ["Meetings"]),
	})
	async prepare(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("eventId") eventId: string,
	) {
		return this.meetings.prepare(eventId, ctx.user.id);
	}
}
