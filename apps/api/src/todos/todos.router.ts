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
import { EmailReplyService } from "./email-reply.service";
import {
	addTodoInput,
	addTodoOutput,
	discardReplyOutput,
	requestReplyInput,
	requestReplyOutput,
	sendReplyInput,
	sendReplyOutput,
	suggestionDecisionOutput,
	suggestionIdInput,
	suggestionsInput,
	suggestionsOutput,
	threadReplyInput,
	threadReplyOutput,
} from "./todos.contracts";
import { TodosService } from "./todos.service";

@Router({ alias: "todos" })
@UseMiddlewares(AuthMiddleware)
export class TodosRouter {
	constructor(
		@Inject(TodosService) private readonly todos: TodosService,
		@Inject(EmailReplyService) private readonly replies: EmailReplyService,
	) {}

	@Query({
		input: suggestionsInput,
		output: suggestionsOutput,
		meta: restMeta("GET", "/todos/suggestions", ["To-dos"]),
	})
	async suggestions(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof suggestionsInput>,
	) {
		return this.todos.suggestions(input, ctx.user.id);
	}

	@Mutation({
		input: addTodoInput,
		output: addTodoOutput,
		meta: restMeta("POST", "/todos", ["To-dos"]),
	})
	async add(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof addTodoInput>,
	) {
		return this.todos.add(input, ctx.user.id);
	}

	@Mutation({
		input: suggestionIdInput,
		output: suggestionDecisionOutput,
		meta: restMeta("POST", "/todos/suggestions/{id}/accept", ["To-dos"]),
	})
	async accept(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.todos.accept(id, ctx.user.id);
	}

	@Mutation({
		input: suggestionIdInput,
		output: suggestionDecisionOutput,
		meta: restMeta("POST", "/todos/suggestions/{id}/ignore", ["To-dos"]),
	})
	async ignore(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.todos.ignore(id, ctx.user.id);
	}

	@Mutation({
		input: suggestionIdInput,
		output: suggestionDecisionOutput,
		meta: restMeta("POST", "/todos/suggestions/{id}/restore", ["To-dos"]),
	})
	async restore(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.todos.restore(id, ctx.user.id);
	}

	@Query({
		input: threadReplyInput,
		output: threadReplyOutput,
		meta: restMeta("GET", "/todos/replies/{emailThreadId}", ["To-dos"]),
	})
	async reply(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("emailThreadId") emailThreadId: string,
	) {
		return this.replies.reply(emailThreadId, ctx.user.id);
	}

	@Mutation({
		input: requestReplyInput,
		output: requestReplyOutput,
		meta: restMeta("POST", "/todos/replies/{emailThreadId}/draft", ["To-dos"]),
	})
	async requestReply(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof requestReplyInput>,
	) {
		return this.replies.requestReply(input, ctx.user.id);
	}

	@Mutation({
		input: sendReplyInput,
		output: sendReplyOutput,
		meta: restMeta("POST", "/todos/replies/{emailThreadId}/send", ["To-dos"]),
	})
	async sendReply(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof sendReplyInput>,
	) {
		return this.replies.send(input, ctx.user.id);
	}

	@Mutation({
		input: threadReplyInput,
		output: discardReplyOutput,
		meta: restMeta("POST", "/todos/replies/{emailThreadId}/discard", [
			"To-dos",
		]),
	})
	async discardReply(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("emailThreadId") emailThreadId: string,
	) {
		return this.replies.discard(emailThreadId, ctx.user.id);
	}
}
