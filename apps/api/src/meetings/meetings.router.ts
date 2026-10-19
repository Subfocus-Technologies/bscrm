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
import {
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
	) {}

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
