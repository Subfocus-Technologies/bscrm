import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { OpportunitiesRouter } from "./opportunities.router";
import { OpportunitiesService } from "./opportunities.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [OpportunitiesService, OpportunitiesRouter],
})
export class OpportunitiesModule {}
