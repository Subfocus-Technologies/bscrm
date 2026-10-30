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
	lessonAddInput,
	lessonIdInput,
	lessonIdOutput,
	lessonsListInput,
	lessonsListOutput,
} from "./lessons.contracts";
import { LessonsService } from "./lessons.service";

@Router({ alias: "lessons" })
@UseMiddlewares(AuthMiddleware)
export class LessonsRouter {
	constructor(
		@Inject(LessonsService) private readonly lessons: LessonsService,
	) {}

	@Query({
		input: lessonsListInput,
		output: lessonsListOutput,
		meta: restMeta("GET", "/lessons", ["To-dos"]),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof lessonsListInput>,
	) {
		return this.lessons.list(input, ctx.user.id);
	}

	@Mutation({
		input: lessonAddInput,
		output: lessonIdOutput,
		meta: restMeta("POST", "/lessons", ["To-dos"]),
	})
	async add(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof lessonAddInput>,
	) {
		return this.lessons.add(input, ctx.user.id);
	}

	@Mutation({
		input: lessonIdInput,
		output: lessonIdOutput,
		meta: restMeta("POST", "/lessons/{id}/remove", ["To-dos"]),
	})
	async remove(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.lessons.remove(id, ctx.user.id);
	}
}
