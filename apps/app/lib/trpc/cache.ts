"use client";

import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "./client";

type Settle = "all" | "record";

type Options = {
	settle?: Settle;
};

type RecordKind = "company" | "contact" | "deal";

const ENTITY_FOR = {
	company: "COMPANY",
	contact: "CONTACT",
	deal: "DEAL",
} as const satisfies Record<RecordKind, string>;

type RemovedRecord = { kind: RecordKind; id: string };

type RemovedRecords = { kind: RecordKind; ids: string[] };

export type CrmCache = {
	company(id?: string, options?: Options): Promise<void>;
	contact(id?: string, options?: Options): Promise<void>;
	deal(id?: string, options?: Options): Promise<void>;
	fields(entity?: RecordKind, options?: Options): Promise<void>;
	fieldCoverage(id?: string, options?: Options): Promise<void>;
	savedViews(entity?: RecordKind, options?: Options): Promise<void>;
	businesses(options?: Options): Promise<void>;
	businessRecords(kind: RecordKind, options?: Options): Promise<void>;
	meetingNotes(options?: Options): Promise<void>;
	investors(options?: Options): Promise<void>;
	todos(options?: Options): Promise<void>;
	priorities(options?: Options): Promise<void>;
	taskRuns(options?: Options): Promise<void>;
	lessons(options?: Options): Promise<void>;
	opportunities(options?: Options): Promise<void>;
	removed(record: RemovedRecord): Promise<void>;
	removedMany(records: RemovedRecords): Promise<void>;
	conversationRemoved(id: string): Promise<void>;
	activity(options?: Options): Promise<void>;
	google(options?: Options): Promise<void>;
	microsoft(options?: Options): Promise<void>;
	settings(options?: Options): Promise<void>;
	currency(options?: Options): Promise<void>;
	workspace(options?: Options): Promise<void>;
	slack(options?: Options): Promise<void>;
	sso(options?: Options): Promise<void>;
	apiKeys(options?: Options): Promise<void>;
	tracking(options?: Options): Promise<void>;
	everything(): Promise<void>;
};

export function useCrmCache(): CrmCache {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const run = (
		record: QueryKey[],
		rest: QueryKey[],
		{ settle = "all" }: Options = {},
	): Promise<void> => {
		const awaited = settle === "all" ? [...record, ...rest] : record;
		const behind = settle === "all" ? [] : rest;

		for (const queryKey of behind) {
			void queryClient.invalidateQueries({ queryKey });
		}

		return Promise.all(
			awaited.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
		).then(() => undefined);
	};

	const activityKeys = () => [
		trpc.activities.timeline.pathKey(),
		trpc.activities.timelineCounts.queryKey(),
		trpc.activities.myTasks.queryKey(),
		trpc.activities.myTaskPage.queryKey(),
	];

	const listKeys = () => [
		trpc.companies.list.queryKey(),
		trpc.contacts.list.queryKey(),
		trpc.deals.list.queryKey(),
		trpc.search.quick.queryKey(),
	];

	const removeRecords = (kind: RecordKind, ids: string[]): Promise<void> => {
		const byId = {
			company: trpc.companies.byId,
			contact: trpc.contacts.byId,
			deal: trpc.deals.byId,
		}[kind];
		const goneKeys = ids.map((id) => byId.queryKey({ id }));
		const gone = new Set(goneKeys.map((key) => JSON.stringify(key)));

		for (const record of [
			trpc.companies.byId,
			trpc.contacts.byId,
			trpc.deals.byId,
		]) {
			void queryClient.invalidateQueries({
				queryKey: record.queryKey(),
				predicate: (query) => !gone.has(JSON.stringify(query.queryKey)),
			});
		}

		for (const queryKey of goneKeys) {
			void queryClient.invalidateQueries({
				queryKey,
				exact: true,
				refetchType: "none",
			});
		}

		return run(
			[...listKeys(), ...activityKeys(), trpc.dashboard.summary.queryKey()],
			[],
		);
	};

	const RECORD_BY_ID = {
		company: () => trpc.companies.byId.queryKey(),
		contact: () => trpc.contacts.byId.queryKey(),
		deal: () => trpc.deals.byId.queryKey(),
	} as const;

	const RECORD_LIST = {
		company: () => trpc.companies.list.queryKey(),
		contact: () => trpc.contacts.list.queryKey(),
		deal: () => trpc.deals.list.queryKey(),
	} as const;

	return {
		fields: (entity, options) =>
			run(
				[
					trpc.fields.list.queryKey(),
					entity
						? trpc.fields.filters.queryKey({ entity: ENTITY_FOR[entity] })
						: trpc.fields.filters.queryKey(),
				],
				entity
					? [RECORD_BY_ID[entity](), RECORD_LIST[entity]()]
					: [...Object.values(RECORD_BY_ID).map((key) => key()), ...listKeys()],
				options,
			),

		fieldCoverage: (id, options) =>
			run(
				[
					id
						? trpc.fields.coverage.queryKey({ id })
						: trpc.fields.coverage.queryKey(),
				],
				[],
				options,
			),

		savedViews: (entity, options) =>
			run(
				[
					entity
						? trpc.savedViews.list.queryKey({
								entity: ENTITY_FOR[entity],
							})
						: trpc.savedViews.list.queryKey(),
				],
				[],
				options,
			),

		businesses: (options) =>
			run(
				[
					trpc.businesses.list.queryKey(),
					trpc.businesses.focus.queryKey(),
					trpc.businesses.forRecord.queryKey(),
					trpc.businesses.suggestions.queryKey(),
					trpc.businesses.unfiled.queryKey(),
					trpc.businesses.listRules.queryKey(),
					trpc.businesses.filingLimit.queryKey(),
				],
				[...listKeys(), trpc.dashboard.summary.queryKey()],
				options,
			),

		meetingNotes: (options) =>
			run(
				[
					trpc.meetingNotes.followUps.queryKey(),
					trpc.meetingNotes.inbox.queryKey(),
					trpc.meetings.upcoming.queryKey(),
				],
				[...activityKeys(), trpc.dashboard.summary.queryKey()],
				options,
			),

		investors: (options) =>
			run(
				[
					trpc.investors.fundraise.queryKey(),
					trpc.investors.list.queryKey(),
					trpc.investors.outreachQueue.queryKey(),
				],
				[],
				options,
			),

		taskRuns: (options) =>
			run(
				[
					trpc.taskRuns.get.queryKey(),
					trpc.taskRuns.list.queryKey(),
					trpc.taskRuns.statuses.queryKey(),
				],
				activityKeys(),
				options,
			),

		lessons: (options) => run([trpc.lessons.list.queryKey()], [], options),

		priorities: (options) =>
			run([trpc.priorities.week.queryKey()], [], options),

		opportunities: (options) =>
			run([trpc.opportunities.list.queryKey()], [], options),

		todos: (options) =>
			run(
				[trpc.todos.suggestions.queryKey(), trpc.todos.reply.queryKey()],
				[...activityKeys(), trpc.dashboard.summary.queryKey()],
				options,
			),

		businessRecords: (kind, options) =>
			run(
				[
					trpc.businesses.forRecord.queryKey(),
					trpc.businesses.suggestions.queryKey(),
				],
				[
					RECORD_LIST[kind](),
					trpc.businesses.unfiled.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		company: (id, options) =>
			run(
				[
					id
						? trpc.companies.byId.queryKey({ id })
						: trpc.companies.byId.queryKey(),
				],
				[
					...listKeys(),
					...activityKeys(),
					trpc.contacts.byId.queryKey(),
					trpc.deals.byId.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		contact: (id, options) =>
			run(
				[
					id
						? trpc.contacts.byId.queryKey({ id })
						: trpc.contacts.byId.queryKey(),
				],
				[
					...listKeys(),
					...activityKeys(),
					trpc.companies.byId.queryKey(),
					trpc.deals.byId.queryKey(),
					trpc.deals.contactOptions.queryKey(),
				],
				options,
			),

		deal: (id, options) =>
			run(
				[id ? trpc.deals.byId.queryKey({ id }) : trpc.deals.byId.queryKey()],
				[
					...listKeys(),
					trpc.deals.contactOptions.queryKey(),
					trpc.companies.byId.queryKey(),
					trpc.contacts.byId.queryKey(),
					...activityKeys(),
					trpc.dashboard.summary.queryKey(),
					trpc.currency.settings.queryKey(),
				],
				options,
			),

		removed: ({ kind, id }) => removeRecords(kind, [id]),

		removedMany: ({ kind, ids }) => removeRecords(kind, ids),

		conversationRemoved: (id) => {
			for (const queryKey of [
				trpc.conversations.builderById.queryKey({ id }),
				trpc.conversations.events.queryKey({ id }),
				trpc.conversations.shareStatus.queryKey({ id }),
			]) {
				void queryClient.invalidateQueries({
					queryKey,
					exact: true,
					refetchType: "none",
				});
			}

			return run([trpc.conversations.builderList.pathKey()], []);
		},

		activity: (options) =>
			run(
				activityKeys(),
				[
					...listKeys(),
					trpc.companies.byId.queryKey(),
					trpc.contacts.byId.queryKey(),
					trpc.deals.byId.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		google: (options) =>
			run(
				[trpc.google.status.queryKey()],
				[
					...activityKeys(),
					...listKeys(),
					trpc.companies.byId.queryKey(),
					trpc.contacts.byId.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		microsoft: (options) =>
			run(
				[trpc.microsoft.status.queryKey()],
				[
					...activityKeys(),
					...listKeys(),
					trpc.companies.byId.queryKey(),
					trpc.contacts.byId.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		settings: (options) =>
			run(
				[
					trpc.settings.agentModel.queryKey(),
					trpc.settings.researchKey.queryKey(),
					trpc.settings.archiveRetention.queryKey(),
				],
				[],
				options,
			),

		currency: (options) =>
			run(
				[trpc.currency.settings.queryKey()],
				[
					...listKeys(),
					trpc.deals.byId.queryKey(),
					trpc.companies.byId.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		workspace: (options) =>
			run(
				[
					trpc.workspace.get.queryKey(),
					trpc.workspace.members.queryKey(),
					trpc.workspace.invites.queryKey(),
				],
				[],
				options,
			),

		slack: (options) =>
			run(
				[trpc.slack.status.queryKey(), trpc.slack.matches.queryKey()],
				[],
				options,
			),

		sso: (options) =>
			run(
				[trpc.sso.list.pathKey()],
				[trpc.sso.settings.queryKey(), trpc.sso.signInOptions.queryKey()],
				options,
			),

		apiKeys: (options) => run([trpc.apiKeys.list.pathKey()], [], options),

		tracking: (options) =>
			run(
				[trpc.tracking.settings.queryKey()],
				[trpc.tracking.sources.queryKey()],
				options,
			),

		everything: () => queryClient.invalidateQueries(),
	};
}
