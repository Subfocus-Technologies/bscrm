import { workspaceDayStart } from "@crm/db/day";
import { WORKSPACE_TIME_ZONE } from "@crm/db/settings";
import { TODOS } from "@crm/validation/todos";
import { BadRequestException, Injectable } from "@nestjs/common";
import { CalendarClient } from "../google/calendar.client";
import { firstFreeSlot, type Interval } from "./free-slot";

const DAY_MS = 24 * 60 * 60 * 1000;

function endOfDay(at: Date): Date {
	return new Date(workspaceDayStart(at).getTime() + DAY_MS);
}

@Injectable()
export class CalendarSlotsService {
	constructor(private readonly calendar: CalendarClient) {}

	async find(
		accessToken: string,
		dueAt: Date | null,
		durationMs?: number,
	): Promise<Interval> {
		const from = new Date();
		const until = new Date(from.getTime() + TODOS.calendar.searchMs);
		const busy = await this.calendar.busyTimes(accessToken, {
			timeMin: from,
			timeMax: until,
			timeZone: WORKSPACE_TIME_ZONE,
		});
		if (busy.outcome !== "ok") {
			throw new BadRequestException(
				`Google Calendar did not say when you are free: ${busy.reason}.`,
			);
		}

		const taken = busy.data.map((time) => ({
			start: new Date(time.start),
			end: new Date(time.end),
		}));
		const deadline = dueAt && dueAt > from ? endOfDay(dueAt) : until;
		const slot =
			firstFreeSlot({ busy: taken, from, until: deadline, durationMs }) ??
			firstFreeSlot({ busy: taken, from, until, durationMs });
		if (!slot) {
			throw new BadRequestException(
				"Your calendar has no free slot in working hours for the next two weeks.",
			);
		}
		return slot;
	}
}
