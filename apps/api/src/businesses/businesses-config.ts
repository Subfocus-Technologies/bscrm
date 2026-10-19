export const BUSINESSES_CONFIG = {
	name: { maxLength: 60 },
	reorder: { maxIds: 200 },
	tones: { count: 5 },
	suggestions: { pageSize: 50 },
} as const;
