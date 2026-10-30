import { WORKSPACE_TIME_ZONE } from "./settings";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function wallClockMs(at: Date, timeZone: string): number {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-GB", {
			timeZone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		})
			.formatToParts(at)
			.map((part) => [part.type, Number(part.value)]),
	);

	return Date.UTC(
		parts.year ?? 0,
		(parts.month ?? 1) - 1,
		parts.day ?? 1,
		parts.hour ?? 0,
		parts.minute ?? 0,
		parts.second ?? 0,
	);
}

export function workspaceDayStart(now = new Date()): Date {
	const wall = new Date(wallClockMs(now, WORKSPACE_TIME_ZONE));
	const midnight = Date.UTC(
		wall.getUTCFullYear(),
		wall.getUTCMonth(),
		wall.getUTCDate(),
	);
	const offset =
		wallClockMs(new Date(midnight), WORKSPACE_TIME_ZONE) - midnight;

	return new Date(midnight - offset);
}

export function nextWorkspaceDayStart(now = new Date()): Date {
	return workspaceDayStart(
		new Date(workspaceDayStart(now).getTime() + 36 * HOUR_MS),
	);
}

export function workspaceWeekStart(now = new Date()): Date {
	const today = workspaceDayStart(now);
	const noon = new Date(today.getTime() + 12 * HOUR_MS);
	const weekday = new Intl.DateTimeFormat("en-GB", {
		timeZone: WORKSPACE_TIME_ZONE,
		weekday: "short",
	}).format(noon);
	const sinceMonday = (WEEKDAYS.indexOf(weekday) + 7) % 7;

	return workspaceDayStart(
		new Date(today.getTime() - sinceMonday * DAY_MS + 2 * HOUR_MS),
	);
}

export function nextWorkspaceWeekStart(weekStart: Date): Date {
	return workspaceDayStart(
		new Date(weekStart.getTime() + 7 * DAY_MS + 2 * HOUR_MS),
	);
}
