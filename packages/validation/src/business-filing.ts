import { z } from "zod";

export const BUSINESS_FILING = {
	playbook: { maxLength: 1500 },
	reason: { maxLength: 280 },
	evidence: { maxItems: 5, quoteMaxLength: 280 },
	sweep: { maxRecords: 200 },
	learning: { examples: 12 },
	rules: { maxPerBusiness: 100 },
} as const;

export const BUSINESS_FILING_EVIDENCE_KINDS = [
	"email",
	"meeting",
	"record",
] as const;

export const businessFilingEvidenceItem = z.object({
	kind: z.enum(BUSINESS_FILING_EVIDENCE_KINDS),
	id: z.string().trim().min(1),
	quote: z.string().trim().min(1).max(BUSINESS_FILING.evidence.quoteMaxLength),
});

export const businessFilingEvidence = z
	.array(businessFilingEvidenceItem)
	.max(BUSINESS_FILING.evidence.maxItems);

export type BusinessFilingEvidenceItem = z.infer<
	typeof businessFilingEvidenceItem
>;

export type BusinessFilingEvidence = z.infer<typeof businessFilingEvidence>;

export function parseBusinessFilingEvidence(
	value: unknown,
): BusinessFilingEvidence {
	if (value === null || value === undefined) return [];

	const parsed = businessFilingEvidence.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			`Stored business filing evidence is unreadable: ${parsed.error.message}`,
		);
	}

	return parsed.data;
}
