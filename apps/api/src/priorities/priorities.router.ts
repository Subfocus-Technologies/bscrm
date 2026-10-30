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
	prioritiesWeekInput,
	prioritiesWeekOutput,
	priorityCreateInput,
	priorityIdInput,
	priorityOutput,
	priorityRemoveOutput,
	priorityUpdateInput,
} from "./priorities.contracts";
import { PrioritiesService } from "./priorities.service";

@Router({ alias: "priorities" })
@UseMiddlewares(AuthMiddleware)
export class PrioritiesRouter {
	constructor(
		@Inject(PrioritiesService) private readonly priorities: PrioritiesService,
	) {}

	@Query({
		input: prioritiesWeekInput,
		output: prioritiesWeekOutput,
		meta: restMeta("GET", "/priorities", ["Priorities"]),
	})
	async week(@Input() input: z.infer<typeof prioritiesWeekInput>) {
		return this.priorities.week(input);
	}

	@Mutation({
		input: priorityCreateInput,
		output: priorityOutput,
		meta: restMeta("POST", "/priorities", ["Priorities"]),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof priorityCreateInput>,
	) {
		return this.priorities.create(input, ctx.user.id);
	}

	@Mutation({
		input: priorityUpdateInput,
		output: priorityOutput,
		meta: restMeta("PATCH", "/priorities/{id}", ["Priorities"]),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof priorityUpdateInput>,
	) {
		return this.priorities.update(input, ctx.user.id);
	}

	@Mutation({
		input: priorityIdInput,
		output: priorityRemoveOutput,
		meta: restMeta("DELETE", "/priorities/{id}", ["Priorities"]),
	})
	async remove(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.priorities.remove(id, ctx.user.id);
	}
}
