import type { Db } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { MailboxResult } from "../mailbox/mailbox-api.client";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import {
	isAutomatedAddress,
	type Participant,
	parseAddress,
	parseAddressList,
} from "../mailbox/participants";
import { GmailClient, type GmailMessage } from "./gmail.client";
import { header } from "./gmail-mime";
import { ADDRESS_SEARCH } from "./google.constants";
import type { FoundAddress, FoundAddresses } from "./google.contracts";

type GmailSearch = FoundAddresses["gmail"];
type GmailSearchResult = { people: FoundAddress[]; gmail: GmailSearch };

function wordsOf(query: string): string[] {
	return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function matches(person: Participant, words: readonly string[]): boolean {
	const text = `${person.name ?? ""} ${person.email}`.toLowerCase();
	return words.every((word) => text.includes(word));
}

export function addressQuery(query: string): string {
	const term = query
		.replace(/["{}()]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return `from:"${term}" OR to:"${term}" OR cc:"${term}"`;
}

function peopleOn(message: GmailMessage): Participant[] {
	const headers = message.payload?.headers;
	const sender = parseAddress(header(headers, "from") ?? "");

	return [
		...(sender ? [sender] : []),
		...parseAddressList(header(headers, "to")),
		...parseAddressList(header(headers, "cc")),
	];
}

export function rankPeople(
	messages: readonly GmailMessage[],
	words: readonly string[],
	ownEmail: string,
): FoundAddress[] {
	const own = ownEmail.toLowerCase();
	const counted = new Map<string, FoundAddress & { count: number }>();

	for (const person of messages.flatMap(peopleOn)) {
		const email = person.email.toLowerCase();
		if (email === own || isAutomatedAddress(email)) continue;
		if (!matches(person, words)) continue;

		const known = counted.get(email);
		counted.set(email, {
			email,
			name: known?.name ?? person.name,
			count: (known?.count ?? 0) + 1,
		});
	}

	return [...counted.values()]
		.sort((first, second) => second.count - first.count)
		.map(({ email, name }) => ({ email, name }));
}

function searchStatusOf(
	outcome: MailboxResult<unknown>["outcome"],
): GmailSearch {
	return outcome === "unauthorized" ? "needs-reconnect" : "failed";
}

@Injectable()
export class AddressFinderService {
	private readonly logger = new Logger(AddressFinderService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailClient,
		private readonly tokens: MailboxTokenService,
	) {}

	async find(userId: string, query: string): Promise<FoundAddresses> {
		const words = wordsOf(query);
		const [contacts, mail] = await Promise.all([
			this.fromContacts(words),
			this.fromGmail(userId, query, words),
		]);

		const unique = new Map(
			[...mail.people, ...contacts].map((person) => [
				person.email.toLowerCase(),
				person,
			]),
		);

		return {
			people: [...unique.values()].slice(0, ADDRESS_SEARCH.maxResults),
			gmail: mail.gmail,
		};
	}

	private async fromContacts(words: readonly string[]) {
		const rows = await this.db.contact.findMany({
			where: {
				email: { not: null },
				archivedAt: null,
				AND: words.map((word) => ({
					OR: [
						{ firstName: { contains: word, mode: "insensitive" as const } },
						{ lastName: { contains: word, mode: "insensitive" as const } },
						{ email: { contains: word, mode: "insensitive" as const } },
					],
				})),
			},
			select: { firstName: true, lastName: true, email: true },
			take: ADDRESS_SEARCH.maxResults,
		});

		return rows.flatMap((row) =>
			row.email
				? [
						{
							email: row.email.toLowerCase(),
							name: [row.firstName, row.lastName].filter(Boolean).join(" "),
						},
					]
				: [],
		);
	}

	private async fromGmail(
		userId: string,
		query: string,
		words: readonly string[],
	): Promise<GmailSearchResult> {
		const token = await this.tokens.accessTokenFor(userId, "gmail");
		if (token.outcome === "not-connected") {
			return { people: [], gmail: "not-connected" };
		}
		if (token.outcome !== "ok") {
			return this.notSearched(userId, token.outcome, token.reason);
		}

		const listed = await this.gmail.searchMessages(token.accessToken, {
			query: addressQuery(query),
			maxResults: ADDRESS_SEARCH.messagesRead,
		});
		if (listed.outcome !== "ok") {
			return this.notSearched(
				userId,
				searchStatusOf(listed.outcome),
				listed.reason,
			);
		}

		const ids = (listed.data.messages ?? []).flatMap((message) =>
			message.id ? [message.id] : [],
		);
		const [user, ...read] = await Promise.all([
			this.db.user.findUniqueOrThrow({
				where: { id: userId },
				select: { email: true },
			}),
			...ids.map((id) => this.gmail.getMessageHeaders(token.accessToken, id)),
		]);

		const messages = read.flatMap((message) =>
			message.outcome === "ok" ? [message.data] : [],
		);
		const unread = read.find((message) => message.outcome !== "ok");
		if (messages.length === 0 && unread) {
			return this.notSearched(
				userId,
				searchStatusOf(unread.outcome),
				unread.reason,
			);
		}

		return {
			people: rankPeople(messages, words, user.email),
			gmail: "searched",
		};
	}

	private notSearched(
		userId: string,
		gmail: GmailSearch,
		reason: string,
	): GmailSearchResult {
		this.logger.warn({
			message: "Address search could not read Gmail",
			userId,
			gmail,
			reason,
		});
		return { people: [], gmail };
	}
}
