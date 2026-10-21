import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { GmailClient } from "../google/gmail.client";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { InvestorOutreachService } from "./investor-outreach.service";
import { InvestorsRouter } from "./investors.router";
import { InvestorsService } from "./investors.service";

@Module({
	imports: [TrpcModule, AgentModule, MailboxModule],
	providers: [
		InvestorsService,
		InvestorOutreachService,
		GmailClient,
		InvestorsRouter,
	],
})
export class InvestorsModule {}
