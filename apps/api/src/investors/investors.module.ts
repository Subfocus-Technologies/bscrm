import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { InvestorsRouter } from "./investors.router";
import { InvestorsService } from "./investors.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [InvestorsService, InvestorsRouter],
})
export class InvestorsModule {}
