export const NO_BUSINESS = "none";

export function scopeListInput<TInput extends { businesses: string[] }>(
	input: TInput,
	business: string | null,
): TInput & { business: string | null } {
	return {
		...input,
		business,
		businesses: business ? [] : input.businesses,
	};
}
