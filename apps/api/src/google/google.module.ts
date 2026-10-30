import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { MailboxModule } from "../mailbox/mailbox.module";
import { MeetingNotesModule } from "../meeting-notes/meeting-notes.module";
import { TrpcModule } from "../trpc/trpc.module";
import { AddressFinderService } from "./address-finder.service";
import { CalendarClient } from "./calendar.client";
import { CalendarSyncService } from "./calendar-sync.service";
import { ConversationService } from "./conversation.service";
import { GeminiNotesCollector } from "./gemini-notes.collector";
import { GmailClient } from "./gmail.client";
import { GmailSyncService } from "./gmail-sync.service";
import { GoogleRouter } from "./google.router";
import { GoogleConnectionService } from "./google-connection.service";
import { GoogleSyncService } from "./google-sync.service";
import { NextMeetingsService } from "./next-meetings.service";

@Module({
	imports: [TrpcModule, MailboxModule, AgentModule, MeetingNotesModule],
	providers: [
		CalendarClient,
		AddressFinderService,
		CalendarSyncService,
		GeminiNotesCollector,
		GmailClient,
		GmailSyncService,
		GoogleSyncService,
		GoogleConnectionService,
		ConversationService,
		NextMeetingsService,
		GoogleRouter,
	],
	exports: [GoogleSyncService, GoogleConnectionService, NextMeetingsService],
})
export class GoogleModule {}
