export {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	GOOGLE_SYNC_SOURCES,
	type GoogleSyncSource,
	SCOPE_FOR_SOURCE,
	SYNC_SCOPES,
} from "../mailbox/mailbox.constants";

export const ADDRESS_SEARCH = {
	queryMinLength: 2,
	queryMaxLength: 80,
	messagesRead: 15,
	maxResults: 5,
} as const;
