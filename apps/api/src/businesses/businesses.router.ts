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
import { bulkResultOutput } from "../crm/bulk";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { BusinessRulesService } from "./business-rules.service";
import { BusinessSuggestionsService } from "./business-suggestions.service";
import {
	businessCreateInput,
	businessDeleteOutput,
	businessFocusOutput,
	businessIdInput,
	businessListOutput,
	businessMembershipInput,
	businessOutput,
	businessRecordInput,
	businessReorderInput,
	businessRuleAddInput,
	businessRuleDeleteOutput,
	businessRuleIdInput,
	businessRuleListOutput,
	businessRuleOutput,
	businessSetFocusInput,
	businessSuggestionDecideInput,
	businessSuggestionDecideOutput,
	businessSuggestionListInput,
	businessSuggestionListOutput,
	businessUpdateInput,
	filingLimitInput,
	filingLimitOutput,
	recordBusinessListOutput,
	sortUnfiledOutput,
	unfiledOutput,
} from "./businesses.contracts";
import { BusinessesService } from "./businesses.service";

@Router({ alias: "businesses" })
@UseMiddlewares(AuthMiddleware)
export class BusinessesRouter {
	constructor(
		@Inject(BusinessesService) private readonly businesses: BusinessesService,
		@Inject(BusinessSuggestionsService)
		private readonly filing: BusinessSuggestionsService,
		@Inject(BusinessRulesService)
		private readonly rules: BusinessRulesService,
	) {}

	@Query({
		output: businessListOutput,
		meta: restMeta("GET", "/businesses", ["Businesses"]),
	})
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.businesses.list(ctx.user.id);
	}

	@Query({
		output: businessFocusOutput,
		meta: restMeta("GET", "/businesses/focus", ["Businesses"]),
	})
	async focus(@Ctx() ctx: AuthedTrpcContext) {
		return this.businesses.focus(ctx.user.id);
	}

	@Mutation({
		input: businessSetFocusInput,
		output: businessFocusOutput,
		meta: restMeta("PUT", "/businesses/focus", ["Businesses"]),
	})
	async setFocus(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessSetFocusInput>,
	) {
		return this.businesses.setFocus(ctx.user.id, input.businessId);
	}

	@Mutation({
		input: businessCreateInput,
		output: businessOutput,
		meta: restMeta("POST", "/businesses", ["Businesses"]),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessCreateInput>,
	) {
		return this.businesses.create(input, ctx.user.id);
	}

	@Mutation({
		input: businessUpdateInput,
		output: businessOutput,
		meta: restMeta("PATCH", "/businesses/{id}", ["Businesses"]),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessUpdateInput>,
	) {
		return this.businesses.update(input, ctx.user.id);
	}

	@Mutation({
		input: businessIdInput,
		output: businessDeleteOutput,
		meta: restMeta("DELETE", "/businesses/{id}", ["Businesses"]),
	})
	async delete(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.businesses.delete(id, ctx.user.id);
	}

	@Mutation({
		input: businessReorderInput,
		output: businessListOutput,
		meta: restMeta("POST", "/businesses/reorder", ["Businesses"]),
	})
	async reorder(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessReorderInput>,
	) {
		return this.businesses.reorder(input, ctx.user.id);
	}

	@Query({
		input: businessRecordInput,
		output: recordBusinessListOutput,
		meta: restMeta("GET", "/businesses/records/{entity}/{id}", ["Businesses"]),
	})
	async forRecord(@Input() input: z.infer<typeof businessRecordInput>) {
		return this.businesses.forRecord(input);
	}

	@Mutation({
		input: businessMembershipInput,
		output: bulkResultOutput,
		meta: restMeta("POST", "/businesses/records/add", ["Businesses"]),
	})
	async addRecords(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessMembershipInput>,
	) {
		return this.businesses.addRecords(input, ctx.user.id);
	}

	@Mutation({
		input: businessMembershipInput,
		output: bulkResultOutput,
		meta: restMeta("POST", "/businesses/records/remove", ["Businesses"]),
	})
	async removeRecords(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessMembershipInput>,
	) {
		return this.businesses.removeRecords(input, ctx.user.id);
	}

	@Query({
		input: businessSuggestionListInput,
		output: businessSuggestionListOutput,
		meta: restMeta("GET", "/businesses/suggestions", ["Businesses"]),
	})
	async suggestions(
		@Input() input: z.infer<typeof businessSuggestionListInput>,
	) {
		return this.filing.list(input);
	}

	@Mutation({
		input: businessSuggestionDecideInput,
		output: businessSuggestionDecideOutput,
		meta: restMeta("POST", "/businesses/suggestions/{id}/decide", [
			"Businesses",
		]),
	})
	async decideSuggestion(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessSuggestionDecideInput>,
	) {
		return this.filing.decide(input, ctx.user.id);
	}

	@Query({
		output: unfiledOutput,
		meta: restMeta("GET", "/businesses/unfiled", ["Businesses"]),
	})
	async unfiled() {
		return this.filing.unfiled();
	}

	@Mutation({
		output: sortUnfiledOutput,
		meta: restMeta("POST", "/businesses/unfiled/sort", ["Businesses"]),
	})
	async sortUnfiled(@Ctx() ctx: AuthedTrpcContext) {
		return this.filing.sortUnfiled(ctx.user.id);
	}

	@Query({
		output: businessRuleListOutput,
		meta: restMeta("GET", "/businesses/rules", ["Businesses"]),
	})
	async listRules() {
		return this.rules.list();
	}

	@Mutation({
		input: businessRuleAddInput,
		output: businessRuleOutput,
		meta: restMeta("POST", "/businesses/rules", ["Businesses"]),
	})
	async addRule(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessRuleAddInput>,
	) {
		return this.rules.add(input, ctx.user.id);
	}

	@Mutation({
		input: businessRuleIdInput,
		output: businessRuleDeleteOutput,
		meta: restMeta("DELETE", "/businesses/rules/{id}", ["Businesses"]),
	})
	async removeRule(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.rules.remove(id, ctx.user.id);
	}

	@Query({
		output: filingLimitOutput,
		meta: restMeta("GET", "/businesses/filing-limit", ["Businesses"]),
	})
	async filingLimit() {
		return this.filing.filingLimit();
	}

	@Mutation({
		input: filingLimitInput,
		output: filingLimitOutput,
		meta: restMeta("PUT", "/businesses/filing-limit", ["Businesses"]),
	})
	async setFilingLimit(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof filingLimitInput>,
	) {
		return this.filing.setFilingLimit(input.limit, ctx.user.id);
	}
}
