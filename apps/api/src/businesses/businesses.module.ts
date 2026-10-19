import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { BusinessRulesService } from "./business-rules.service";
import { BusinessSuggestionsService } from "./business-suggestions.service";
import { BusinessesRouter } from "./businesses.router";
import { BusinessesService } from "./businesses.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [
		BusinessesService,
		BusinessSuggestionsService,
		BusinessRulesService,
		BusinessesRouter,
	],
	exports: [BusinessesService],
})
export class BusinessesModule {}
