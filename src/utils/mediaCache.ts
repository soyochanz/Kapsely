export const MAX_CACHE_SIZE = 200;

class MediaCache {
    private cache = new Map<string, { latestItem: any; collage: any[] }>();

    get(id: string) {
        return this.cache.get(id);
    }

    set(id: string, data: { latestItem: any; collage: any[] }) {
        if (this.cache.size > MAX_CACHE_SIZE) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
        this.cache.set(id, data);
    }

    clear() {
        this.cache.clear();
    }
}

export const cardMediaCache = new MediaCache();
