import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export async function loadBusinessFocus(): Promise<string | null> {
	try {
		const focus = await getServerQueryClient().fetchQuery(
			getServerTrpc().businesses.focus.queryOptions(),
		);
		return focus.businessId;
	} catch (error) {
		unstable_rethrow(error);
		return null;
	}
}
