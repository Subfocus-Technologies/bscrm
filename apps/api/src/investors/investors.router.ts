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
import { InvestorOutreachService } from "./investor-outreach.service";
import {
	fundraiseGetOutput,
	fundraiseOutput,
	fundraiseSaveInput,
	investorAddressInput,
	investorEmailIdInput,
	investorIdsInput,
	investorImportInput,
	investorImportOutput,
	investorListInput,
	investorListOutput,
	investorQueuedOutput,
	investorStageInput,
	investorStageOutput,
	outreachOutput,
	outreachQueuedOutput,
	sendInvestorEmailInput,
	sendInvestorEmailOutput,
} from "./investors.contracts";
import { InvestorsService } from "./investors.service";

@Router({ alias: "investors" })
@UseMiddlewares(AuthMiddleware)
export class InvestorsRouter {
	constructor(
		@Inject(InvestorsService) private readonly investors: InvestorsService,
		@Inject(InvestorOutreachService)
		private readonly outreach: InvestorOutreachService,
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

	@Query({
		output: outreachOutput,
		meta: restMeta("GET", "/investors/outreach", ["Investors"]),
	})
	async outreachQueue(@Ctx() ctx: AuthedTrpcContext) {
		return this.outreach.overview(ctx.user.id);
	}

	@Mutation({
		input: sendInvestorEmailInput,
		output: sendInvestorEmailOutput,
		meta: restMeta("POST", "/investors/outreach/{id}/send", ["Investors"]),
	})
	async sendEmail(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof sendInvestorEmailInput>,
	) {
		return this.outreach.send(input, ctx.user.id);
	}

	@Mutation({
		input: investorEmailIdInput,
		output: investorEmailIdInput,
		meta: restMeta("POST", "/investors/outreach/{id}/skip", ["Investors"]),
	})
	async skipEmail(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.outreach.skip(id, ctx.user.id);
	}

	@Mutation({
		input: investorEmailIdInput,
		output: outreachQueuedOutput,
		meta: restMeta("POST", "/investors/outreach/{id}/redraft", ["Investors"]),
	})
	async redraftEmail(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.outreach.redraft(id, ctx.user.id);
	}

	@Mutation({
		input: investorAddressInput,
		output: outreachQueuedOutput,
		meta: restMeta("POST", "/investors/{investorId}/email", ["Investors"]),
	})
	async setAddress(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof investorAddressInput>,
	) {
		return this.outreach.setAddress(input, ctx.user.id);
	}
}
