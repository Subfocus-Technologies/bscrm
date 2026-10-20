import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { GoogleModule } from "../google/google.module";
import { TrpcModule } from "../trpc/trpc.module";
import { MeetingsRouter } from "./meetings.router";
import { MeetingsService } from "./meetings.service";

@Module({
	imports: [TrpcModule, AgentModule, GoogleModule],
	providers: [MeetingsService, MeetingsRouter],
})
export class MeetingsModule {}
