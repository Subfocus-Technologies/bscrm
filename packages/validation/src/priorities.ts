export const PRIORITIES = {
	columnMax: 100,
	text: { titleMaxLength: 160, deliverableMaxLength: 1_000 },
} as const;

export const PRIORITY_STATUSES = ["PRIORITY", "ONGOING", "DONE"] as const;

export type PriorityStatus = (typeof PRIORITY_STATUSES)[number];
