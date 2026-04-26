import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. Initialize the Query Client
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // "Stale-While-Revalidate" configuration
            // Data is considered fresh for 1 minute
            staleTime: 1000 * 60,
            // Data is kept in cache for 24 hours
            gcTime: 1000 * 60 * 60 * 24,
            // Retry failed requests up to 2 times
            retry: 2,
            // Avoid refetching on every mount if data is fresh
            refetchOnWindowFocus: false,
        },
    },
});

// 2. Create the AsyncStorage Persister
export const asyncStoragePersister = createAsyncStoragePersister({
    storage: AsyncStorage,
    key: 'KAPSELY_OFFLINE_CACHE',
});
