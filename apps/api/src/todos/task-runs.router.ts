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
	taskRunActionIdInput,
	taskRunApproveInput,
	taskRunDecisionOutput,
	taskRunIdInput,
	taskRunOutput,
	taskRunSaveStepOutput,
	taskRunSaveWorkInput,
	taskRunStartInput,
	taskRunStartOutput,
	taskRunStatusesInput,
	taskRunStatusesOutput,
	taskRunsListInput,
	taskRunsListOutput,
} from "./task-runs.contracts";
import { TaskRunsService } from "./task-runs.service";

@Router({ alias: "taskRuns" })
@UseMiddlewares(AuthMiddleware)
export class TaskRunsRouter {
	constructor(
		@Inject(TaskRunsService) private readonly runs: TaskRunsService,
	) {}

	@Mutation({
		input: taskRunStartInput,
		output: taskRunStartOutput,
		meta: restMeta("POST", "/task-runs", ["To-dos"]),
	})
	async start(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof taskRunStartInput>,
	) {
		return this.runs.start(input, ctx.user.id);
	}

	@Query({
		input: taskRunIdInput,
		output: taskRunOutput,
		meta: restMeta("GET", "/task-runs/{id}", ["To-dos"]),
	})
	async get(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.runs.get(id, ctx.user.id);
	}

	@Query({
		input: taskRunsListInput,
		output: taskRunsListOutput,
		meta: restMeta("GET", "/task-runs", ["To-dos"]),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof taskRunsListInput>,
	) {
		return this.runs.list(input, ctx.user.id);
	}

	@Query({
		input: taskRunStatusesInput,
		output: taskRunStatusesOutput,
		meta: restMeta("GET", "/task-runs/statuses", ["To-dos"]),
	})
	async statuses(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof taskRunStatusesInput>,
	) {
		return this.runs.statuses(input.taskIds, ctx.user.id);
	}

	@Mutation({
		input: taskRunApproveInput,
		output: taskRunDecisionOutput,
		meta: restMeta("POST", "/task-runs/actions/{actionId}/approve", ["To-dos"]),
	})
	async approve(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof taskRunApproveInput>,
	) {
		return this.runs.approve(input, ctx.user.id);
	}

	@Mutation({
		input: taskRunActionIdInput,
		output: taskRunDecisionOutput,
		meta: restMeta("POST", "/task-runs/actions/{actionId}/skip", ["To-dos"]),
	})
	async skip(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("actionId") actionId: string,
	) {
		return this.runs.skip(actionId, ctx.user.id);
	}

	@Mutation({
		input: taskRunApproveInput,
		output: taskRunSaveStepOutput,
		meta: restMeta("POST", "/task-runs/actions/{actionId}/save", ["To-dos"]),
	})
	async saveStep(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof taskRunApproveInput>,
	) {
		return this.runs.saveStep(input, ctx.user.id);
	}

	@Mutation({
		input: taskRunSaveWorkInput,
		output: taskRunStartOutput,
		meta: restMeta("POST", "/task-runs/{id}/work", ["To-dos"]),
	})
	async saveWork(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof taskRunSaveWorkInput>,
	) {
		return this.runs.saveWork(input, ctx.user.id);
	}

	@Mutation({
		input: taskRunIdInput,
		output: taskRunSaveStepOutput,
		meta: restMeta("POST", "/task-runs/{id}/email", ["To-dos"]),
	})
	async addEmail(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.runs.addEmail(id, ctx.user.id);
	}

	@Mutation({
		input: taskRunIdInput,
		output: taskRunStartOutput,
		meta: restMeta("POST", "/task-runs/{id}/finish", ["To-dos"]),
	})
	async finish(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.runs.finish(id, ctx.user.id);
	}
}
