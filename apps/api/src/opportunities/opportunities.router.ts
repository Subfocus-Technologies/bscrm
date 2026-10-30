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
	opportunitiesListInput,
	opportunitiesListOutput,
	opportunityKindInput,
	opportunityOutput,
	opportunityReviewOutput,
	opportunityUpdateInput,
} from "./opportunities.contracts";
import { OpportunitiesService } from "./opportunities.service";

@Router({ alias: "opportunities" })
@UseMiddlewares(AuthMiddleware)
export class OpportunitiesRouter {
	constructor(
		@Inject(OpportunitiesService)
		private readonly opportunities: OpportunitiesService,
	) {}

	@Query({
		input: opportunitiesListInput,
		output: opportunitiesListOutput,
		meta: restMeta("GET", "/opportunities", ["Opportunities"]),
	})
	async list(@Input() input: z.infer<typeof opportunitiesListInput>) {
		return this.opportunities.list(input);
	}

	@Mutation({
		input: opportunityKindInput,
		output: opportunityReviewOutput,
		meta: restMeta("POST", "/opportunities/review", ["Opportunities"]),
	})
	async review(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof opportunityKindInput>,
	) {
		return this.opportunities.review(input.kind, ctx.user.id);
	}

	@Mutation({
		input: opportunityUpdateInput,
		output: opportunityOutput,
		meta: restMeta("PATCH", "/opportunities/{id}", ["Opportunities"]),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof opportunityUpdateInput>,
	) {
		return this.opportunities.update(input, ctx.user.id);
	}
}
