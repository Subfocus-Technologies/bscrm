import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { PrioritiesRouter } from "./priorities.router";
import { PrioritiesService } from "./priorities.service";

@Module({
	imports: [TrpcModule],
	providers: [PrioritiesService, PrioritiesRouter],
})
export class PrioritiesModule {}
