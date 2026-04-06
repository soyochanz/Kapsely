type Listener = () => void;

const listeners = new Set<Listener>();

export const feedScrollBus = {
    subscribe(listener: Listener) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
    emitScrollToTop() {
        listeners.forEach((listener) => {
            try {
                listener();
            } catch (error) {
                console.warn('feedScrollBus listener error', error);
            }
        });
    },
};
