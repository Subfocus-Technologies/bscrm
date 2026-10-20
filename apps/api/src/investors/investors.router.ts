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
	fundraiseGetOutput,
	fundraiseOutput,
	fundraiseSaveInput,
	investorIdsInput,
	investorImportInput,
	investorImportOutput,
	investorListInput,
	investorListOutput,
	investorQueuedOutput,
	investorStageInput,
	investorStageOutput,
} from "./investors.contracts";
import { InvestorsService } from "./investors.service";

@Router({ alias: "investors" })
@UseMiddlewares(AuthMiddleware)
export class InvestorsRouter {
	constructor(
		@Inject(InvestorsService) private readonly investors: InvestorsService,
	) {}

	@Query({
		output: fundraiseGetOutput,
		meta: restMeta("GET", "/investors/fundraise", ["Investors"]),
	})
	async fundraise() {
		return this.investors.fundraise();
	}

	@Mutation({
		input: fundraiseSaveInput,
		output: fundraiseOutput,
		meta: restMeta("PUT", "/investors/fundraise", ["Investors"]),
	})
	async saveFundraise(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof fundraiseSaveInput>,
	) {
		return this.investors.save(input, ctx.user.id);
	}

	@Query({
		input: investorListInput,
		output: investorListOutput,
		meta: restMeta("GET", "/investors", ["Investors"]),
	})
	async list(@Input() input: z.infer<typeof investorListInput>) {
		return this.investors.list(input);
	}

	@Mutation({
		input: investorStageInput,
		output: investorStageOutput,
		meta: restMeta("POST", "/investors/stage", ["Investors"]),
	})
	async setStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof investorStageInput>,
	) {
		return this.investors.setStage(input, ctx.user.id);
	}

	@Mutation({
		input: investorImportInput,
		output: investorImportOutput,
		meta: restMeta("POST", "/investors/import", ["Investors"]),
	})
	async import(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof investorImportInput>,
	) {
		return this.investors.importRows(input, ctx.user.id);
	}

	@Mutation({
		input: investorIdsInput,
		output: investorQueuedOutput,
		meta: restMeta("POST", "/investors/research", ["Investors"]),
	})
	async research(@Ctx() ctx: AuthedTrpcContext, @Input("ids") ids: string[]) {
		return this.investors.research(ids, ctx.user.id);
	}

	@Mutation({
		output: investorQueuedOutput,
		meta: restMeta("POST", "/investors/find-more", ["Investors"]),
	})
	async findMore(@Ctx() ctx: AuthedTrpcContext) {
		return this.investors.findMore(ctx.user.id);
	}
}
