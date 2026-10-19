import { FIELD_ENTITIES } from "@crm/db/fields";
import {
	BUSINESS_FILING,
	businessFilingEvidence,
} from "@crm/validation/business-filing";
import { z } from "zod";
import { bulkIdsInput } from "../crm/bulk";
import { MAX_AMOUNT_CENTS } from "../deals/deals.contracts";
import { BUSINESSES_CONFIG } from "./businesses-config";

const businessName = z
	.string()
	.trim()
	.min(1, "A business needs a name.")
	.max(
		BUSINESSES_CONFIG.name.maxLength,
		`Keep the name under ${BUSINESSES_CONFIG.name.maxLength} characters.`,
	);

const businessTargetOutput = z.object({
	cents: z.number(),
	currency: z.string(),
});

export const businessOutput = z.object({
	id: z.string(),
	name: z.string(),
	tone: z.number().int(),
	playbook: z.string().nullable(),
	target: businessTargetOutput.nullable(),
});

export type BusinessSummary = z.infer<typeof businessOutput>;

export const businessListOutput = z.array(businessOutput);

export const businessFocusOutput = z.object({
	businessId: z.string().nullable(),
});

export type BusinessFocusResult = z.infer<typeof businessFocusOutput>;

export const businessSetFocusInput = z.object({
	businessId: z.string().nullable(),
});

export const businessCreateInput = z.object({
	name: businessName,
});

export type BusinessCreateInput = z.infer<typeof businessCreateInput>;

const businessPlaybook = z
	.string()
	.trim()
	.max(
		BUSINESS_FILING.playbook.maxLength,
		`Keep the playbook under ${BUSINESS_FILING.playbook.maxLength} characters.`,
	)
	.transform((value) => (value.length > 0 ? value : null))
	.nullable();

export const businessUpdateInput = z.object({
	id: z.string(),
	name: businessName,
	playbook: businessPlaybook,
	monthlyTargetCents: z
		.number()
		.int()
		.min(0, "A target cannot be negative.")
		.max(MAX_AMOUNT_CENTS, "That target is too large.")
		.nullable(),
});

export type BusinessUpdateInput = z.infer<typeof businessUpdateInput>;

export const businessIdInput = z.object({ id: z.string() });

export const businessDeleteOutput = z.object({ id: z.string() });

export const businessReorderInput = z.object({
	ids: z.array(z.string()).min(1).max(BUSINESSES_CONFIG.reorder.maxIds),
});

export type BusinessReorderInput = z.infer<typeof businessReorderInput>;

const businessEntity = z.enum(FIELD_ENTITIES);

const filingSource = z.enum(["MANUAL", "AGENT", "RULE"]);

const recordBusinessOutput = businessOutput.extend({
	source: filingSource.nullable(),
	reason: z.string().nullable(),
});

export const recordBusinessListOutput = z.array(recordBusinessOutput);

export type RecordBusiness = z.infer<typeof recordBusinessOutput>;

const suggestionEntity = z.enum(["COMPANY", "CONTACT"]);

export const businessSuggestionListInput = z.object({
	entity: suggestionEntity.optional(),
	recordId: z.string().optional(),
});

export type BusinessSuggestionListInput = z.infer<
	typeof businessSuggestionListInput
>;

const businessSuggestionOutput = z.object({
	id: z.string(),
	business: businessOutput,
	record: z.object({
		kind: z.enum(["company", "contact"]),
		id: z.string(),
		name: z.string(),
	}),
	reason: z.string(),
	evidence: businessFilingEvidence,
	createdAt: z.string(),
});

export type BusinessSuggestionSummary = z.infer<
	typeof businessSuggestionOutput
>;

export const businessSuggestionListOutput = z.object({
	rows: z.array(businessSuggestionOutput),
	total: z.number(),
});

export const businessSuggestionDecideInput = z.object({
	id: z.string(),
	decision: z.enum(["accept", "dismiss"]),
});

export type BusinessSuggestionDecideInput = z.infer<
	typeof businessSuggestionDecideInput
>;

export const businessSuggestionDecideOutput = z.object({
	id: z.string(),
	status: z.enum(["ACCEPTED", "DISMISSED"]),
});

export const unfiledOutput = z.object({
	companies: z.number(),
	contacts: z.number(),
});

export const sortUnfiledOutput = z.object({
	queued: z.number(),
	remaining: z.number(),
});

export const businessRecordInput = z.object({
	entity: businessEntity,
	id: z.string(),
});

export type BusinessRecordInput = z.infer<typeof businessRecordInput>;

export const businessMembershipInput = bulkIdsInput.extend({
	entity: businessEntity,
	businessId: z.string(),
});

export type BusinessMembershipInput = z.infer<typeof businessMembershipInput>;

const ruleKind = z.enum(["EMAIL_DOMAIN", "MAILBOX"]);

export const businessRuleOutput = z.object({
	id: z.string(),
	businessId: z.string(),
	kind: ruleKind,
	value: z.string(),
});

export type BusinessRuleSummary = z.infer<typeof businessRuleOutput>;

export const businessRuleListOutput = z.array(businessRuleOutput);

export const businessRuleAddInput = z.object({
	businessId: z.string(),
	kind: ruleKind,
	value: z.string().trim().min(1, "Type a domain or an address."),
});

export type BusinessRuleAddInput = z.infer<typeof businessRuleAddInput>;

export const businessRuleIdInput = z.object({ id: z.string() });

export const businessRuleDeleteOutput = z.object({ id: z.string() });

export const filingLimitOutput = z.object({
	limit: z.number().int(),
	usedToday: z.number().int(),
	max: z.number().int(),
});

export const filingLimitInput = z.object({
	limit: z.number().int(),
});
