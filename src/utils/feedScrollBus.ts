type Listener = () => void;

const scrollListeners = new Set<Listener>();
const refreshListeners = new Set<Listener>();

export const feedScrollBus = {
    subscribeScroll(listener: Listener) {
        scrollListeners.add(listener);
        return () => scrollListeners.delete(listener);
    },
    subscribeRefresh(listener: Listener) {
        refreshListeners.add(listener);
        return () => refreshListeners.delete(listener);
    },
    emitScrollToTop() {
        scrollListeners.forEach(l => {
            try { l(); } catch (e) { console.warn('scroll listener error', e); }
        });
    },
    emitRefresh() {
        refreshListeners.forEach(l => {
            try { l(); } catch (e) { console.warn('refresh listener error', e); }
        });
    }
};
