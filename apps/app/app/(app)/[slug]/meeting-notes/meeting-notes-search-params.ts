import { INCOMING_MEETING_NOTE_VIEWS } from "@crm/validation/meeting-notes";
import {
	createLoader,
	parseAsInteger,
	parseAsStringLiteral,
} from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";

export const meetingNotesParsers = {
	[SEARCH_PARAM.meetingNotes.view]: parseAsStringLiteral(
		INCOMING_MEETING_NOTE_VIEWS,
	).withDefault("NEW"),
	[SEARCH_PARAM.list.page]: parseAsInteger.withDefault(1),
};

export const loadMeetingNotesSearchParams = createLoader(meetingNotesParsers);
