"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function useBusinessFocus(): string | null {
	const trpc = useTRPC();
	const focus = useQuery(trpc.businesses.focus.queryOptions());

	return focus.data?.businessId ?? null;
}

export function useSetBusinessFocus() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return useMutation(
		trpc.businesses.setFocus.mutationOptions({
			onMutate: async ({ businessId }) => {
				const key = trpc.businesses.focus.queryKey();
				await queryClient.cancelQueries({ queryKey: key });
				const previous = queryClient.getQueryData(key);
				queryClient.setQueryData(key, { businessId });
				return { previous };
			},
			onError: (error, _variables, context) => {
				queryClient.setQueryData(
					trpc.businesses.focus.queryKey(),
					context?.previous,
				);
				toast.error(error.message);
			},
			onSettled: () =>
				queryClient.invalidateQueries({
					queryKey: trpc.businesses.focus.queryKey(),
				}),
		}),
	);
}
