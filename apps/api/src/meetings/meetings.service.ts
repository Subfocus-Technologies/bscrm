import type { Db, Prisma } from "@crm/db";
import { RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { MEETING_NOTES, meetingNotesMeta } from "@crm/validation/meeting-notes";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import {
	companyBusinessScope,
	contactBusinessScope,
} from "../businesses/business-scope";
import { InjectDatabase } from "../database/database.constants";
import type {
	UpcomingMeeting,
	UpcomingMeetingsInput,
} from "./meetings.contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

const EVENT_SELECT = {
	id: true,
	title: true,
	startsAt: true,
	endsAt: true,
	conferenceUrl: true,
	syncedByUserId: true,
	company: { select: { id: true, name: true } },
	contact: {
		select: {
			id: true,
			firstName: true,
			lastName: true,
			brief: { select: { refreshedAt: true } },
		},
	},
	attendees: {
		select: {
			email: true,
			contact: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					brief: { select: { refreshedAt: true } },
				},
			},
		},
	},
} as const;

type EventRow = Prisma.CalendarEventGetPayload<{ select: typeof EVENT_SELECT }>;

type PersonRow = NonNullable<EventRow["contact"]>;

function personName(person: PersonRow): string {
	return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

function primaryContact(event: EventRow): PersonRow | null {
	return (
		event.contact ??
		event.attendees.find((attendee) => attendee.contact)?.contact ??
		null
	);
}

function businessWhere(
	business: string | null,
): Prisma.CalendarEventWhereInput {
	if (!business) return {};

	return {
		OR: [
			{ contact: contactBusinessScope(business) },
			{ company: companyBusinessScope(business) },
			{ attendees: { some: { contact: contactBusinessScope(business) } } },
		],
	};
}

@Injectable()
export class MeetingsService {
	private readonly logger = new Logger(MeetingsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async upcoming(input: UpcomingMeetingsInput): Promise<UpcomingMeeting[]> {
		const now = new Date();
		const { daysBack, daysAhead, maxMeetings, briefFreshDays } =
			MEETING_NOTES.upcoming;
		const from = new Date(now.getTime() - daysBack * DAY_MS);

		const events = await this.db.calendarEvent.findMany({
			where: {
				AND: [
					{
						startsAt: {
							gte: from,
							lt: new Date(now.getTime() + daysAhead * DAY_MS),
						},
						status: { not: "cancelled" },
						isAllDay: false,
						OR: [
							{ contactId: { not: null } },
							{ companyId: { not: null } },
							{ attendees: { some: { contactId: { not: null } } } },
						],
					},
					businessWhere(input.business),
				],
			},
			orderBy: { startsAt: "asc" },
			take: maxMeetings,
			select: EVENT_SELECT,
		});

		const contactIds = events.flatMap((event) => {
			const contact = primaryContact(event);
			return contact ? [contact.id] : [];
		});

		const [users, preparing, failed, notes] = await Promise.all([
			this.db.user.findMany({ select: { id: true, name: true, email: true } }),
			this.db.agentTask.findMany({
				where: {
					kind: "meeting-prep",
					finishedAt: null,
					contactId: { in: contactIds },
				},
				select: { contactId: true },
			}),
			this.db.agentTask.findMany({
				where: {
					kind: "meeting-prep",
					contactId: { in: contactIds },
					finishedAt: { gte: from },
					outcome: RETIRED_OUTCOME,
				},
				select: { contactId: true },
			}),
			this.db.activity.findMany({
				where: {
					type: "MEETING",
					createdAt: { gte: from },
					meta: { path: ["meetingNotes"], equals: true },
				},
				select: { id: true, meta: true },
			}),
		]);

		const teamByEmail = new Map(
			users.map((user) => [user.email.toLowerCase(), user.name]),
		);
		const teamById = new Map(users.map((user) => [user.id, user.name]));
		const preparingIds = new Set(preparing.map((task) => task.contactId));
		const failedIds = new Set(failed.map((task) => task.contactId));
		const notesByEvent = new Map(
			notes.flatMap((activity) => {
				const meta = meetingNotesMeta.parse(activity.meta);
				return meta?.calendarEventId
					? [[meta.calendarEventId, activity.id]]
					: [];
			}),
		);
		const freshAfter = now.getTime() - briefFreshDays * DAY_MS;

		return events.map((event) => {
			const contact = primaryContact(event);
			const team = new Set(
				event.attendees.flatMap((attendee) => {
					const name = teamByEmail.get(attendee.email.toLowerCase());
					return name ? [name] : [];
				}),
			);
			const syncedBy = event.syncedByUserId
				? teamById.get(event.syncedByUserId)
				: undefined;
			if (syncedBy) team.add(syncedBy);

			const prep = !contact
				? "unavailable"
				: preparingIds.has(contact.id)
					? "preparing"
					: contact.brief && contact.brief.refreshedAt.getTime() >= freshAfter
						? "ready"
						: failedIds.has(contact.id)
							? "failed"
							: "none";

			return {
				id: event.id,
				title: event.title,
				startsAt: event.startsAt.toISOString(),
				endsAt: event.endsAt.toISOString(),
				conferenceUrl: event.conferenceUrl,
				phase: event.endsAt.getTime() <= now.getTime() ? "done" : "upcoming",
				team: [...team],
				contact: contact ? { id: contact.id, name: personName(contact) } : null,
				company: event.company,
				prep,
				notesActivityId: notesByEvent.get(event.id) ?? null,
			};
		});
	}

	async prepare(
		eventId: string,
		actingUserId: string,
	): Promise<{ queued: boolean }> {
		const event = await this.db.calendarEvent.findUnique({
			where: { id: eventId },
			select: EVENT_SELECT,
		});
		if (!event) throw new NotFoundException(`No meeting with id ${eventId}.`);

		const contact = primaryContact(event);
		if (!contact) {
			throw new NotFoundException(
				"This meeting has nobody from the CRM on it to prepare for.",
			);
		}

		const queued = await this.agent.meetingPrepRequested(
			contact.id,
			event.startsAt,
		);

		this.logger.log({
			message: "Meeting prep requested",
			eventId,
			queued,
			userId: actingUserId,
		});

		return { queued };
	}
}
