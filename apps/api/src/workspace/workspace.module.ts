import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { MembersAccessService } from "./members-access.service";
import { WorkspaceRouter } from "./workspace.router";
import { WorkspaceService } from "./workspace.service";

@Module({
	imports: [AgentModule, TrpcModule],
	providers: [WorkspaceService, MembersAccessService, WorkspaceRouter],
	exports: [WorkspaceService],
})
export class WorkspaceModule {}
