import { workspaceDayStart } from "@crm/db/day";
import { WORKSPACE_TIME_ZONE } from "@crm/db/settings";
import { TODOS } from "@crm/validation/todos";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKEND = new Set(["Sat", "Sun"]);

export type Interval = { start: Date; end: Date };

function weekday(at: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		weekday: "short",
		timeZone: WORKSPACE_TIME_ZONE,
	}).format(at);
}

function overlaps(slot: Interval, busy: readonly Interval[]): boolean {
	return busy.some((taken) => slot.start < taken.end && taken.start < slot.end);
}

function roundUp(at: Date, stepMs: number): Date {
	return new Date(Math.ceil(at.getTime() / stepMs) * stepMs);
}

export function firstFreeSlot(input: {
	busy: readonly Interval[];
	from: Date;
	until: Date;
	durationMs?: number;
}): Interval | null {
	const { slotMs, stepMs, dayStartHour, dayEndHour } = TODOS.calendar;
	const length = input.durationMs ?? slotMs;

	for (
		let day = workspaceDayStart(input.from);
		day < input.until;
		day = workspaceDayStart(new Date(day.getTime() + DAY_MS + 2 * HOUR_MS))
	) {
		const noon = new Date(day.getTime() + 12 * HOUR_MS);
		if (WEEKEND.has(weekday(noon))) continue;

		const opens = new Date(day.getTime() + dayStartHour * HOUR_MS);
		const closes = new Date(day.getTime() + dayEndHour * HOUR_MS);
		let start = roundUp(input.from > opens ? input.from : opens, stepMs);

		while (start.getTime() + length <= closes.getTime()) {
			const slot = { start, end: new Date(start.getTime() + length) };
			if (slot.end > input.until) return null;
			if (!overlaps(slot, input.busy)) return slot;
			start = new Date(start.getTime() + stepMs);
		}
	}

	return null;
}
