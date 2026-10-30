import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { CalendarClient } from "../google/calendar.client";
import { GmailClient } from "../google/gmail.client";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { CalendarSlotsService } from "./calendar-slots.service";
import { EmailReplyService } from "./email-reply.service";
import { LessonsRouter } from "./lessons.router";
import { LessonsService } from "./lessons.service";
import { TaskRunsRouter } from "./task-runs.router";
import { TaskRunsService } from "./task-runs.service";
import { TodosRouter } from "./todos.router";
import { TodosService } from "./todos.service";

@Module({
	imports: [TrpcModule, AgentModule, MailboxModule],
	providers: [
		TodosService,
		EmailReplyService,
		GmailClient,
		CalendarClient,
		CalendarSlotsService,
		TaskRunsService,
		LessonsService,
		TodosRouter,
		TaskRunsRouter,
		LessonsRouter,
	],
})
export class TodosModule {}
