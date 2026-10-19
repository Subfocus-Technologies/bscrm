"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export type Business = {
	id: string;
	name: string;
	tone: number;
	playbook: string | null;
	target: { cents: number; currency: string } | null;
};

function reordered(previous: Business[], ids: string[]): Business[] {
	const byId = new Map(previous.map((business) => [business.id, business]));
	return ids.flatMap((id) => {
		const business = byId.get(id);
		return business ? [business] : [];
	});
}

export function useBusinesses() {
	const trpc = useTRPC();
	return useQuery(trpc.businesses.list.queryOptions());
}

export function useReorderBusinesses() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const cache = useCrmCache();
	const listKey = trpc.businesses.list.queryKey();

	return useMutation(
		trpc.businesses.reorder.mutationOptions({
			onMutate: async ({ ids }) => {
				await queryClient.cancelQueries({ queryKey: listKey });
				const previous = queryClient.getQueryData<Business[]>(listKey);
				if (previous) {
					queryClient.setQueryData(listKey, reordered(previous, ids));
				}
				return { previous };
			},
			onError: (error, _variables, context) => {
				queryClient.setQueryData(listKey, context?.previous);
				toast.error(error.message);
			},
			onSettled: () => cache.businesses({ settle: "record" }),
		}),
	);
}
