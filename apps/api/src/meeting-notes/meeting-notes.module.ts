import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { IncomingNotesService } from "./incoming-notes.service";
import { MeetingNotesRouter } from "./meeting-notes.router";
import { MeetingNotesService } from "./meeting-notes.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [MeetingNotesService, IncomingNotesService, MeetingNotesRouter],
	exports: [IncomingNotesService],
})
export class MeetingNotesModule {}
