import { supabase } from '../lib/supabase';

export interface ModelTimerConfig {
    x: number; // 0 to 1 (left)
    y: number; // 0 to 1 (top)
    w: number; // 0 to 1 (width)
    h: number; // 0 to 1 (height)
    color: string;
    fontId: string;
    format: 'standard' | 'days';
    curvature: number; // -10 to 10
    themeColor: string;
    // Cute Face Config
    faceX?: number;
    faceY?: number;
    faceScale?: number;
    showFace?: boolean;
}

export interface ModelChainConfig {
    model_id: string;
    chain_id: string;
    x: number;
    y: number;
    scale: number;
}

export interface ChainItem {
    id: string;
    name: string;
    image_url: string;
    thumbnail_url?: string;
    is_active: boolean;
}

export const DEFAULT_CONFIGS: Record<string, ModelTimerConfig> = {
    beach: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#0ea5e9', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    burger: { x: 0.35, y: 0.52, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#e67e22', faceX: 0.5, faceY: 0.64, faceScale: 1, showFace: true },
    cake: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ec4899', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    china: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff4757', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    choco: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#5d4037', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    disco: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    dragon: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff1493', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    dubai: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#d4a017', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    galaxy: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#4b0082', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    greenlime: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#6abf69', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    h2o: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#00d2ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    lava: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff4500', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    orange: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff8c00', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    pink: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff69b4', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    poke: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff0000', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    rocket: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#708090', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    star: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ffd700', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    travel: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#2ed573', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    cottoncandy: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ffacf5', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    cookies: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#c56cf0', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    glowjelly: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a29bfe', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    shark: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#2f3542', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    dog: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ffa502', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
};

class TimerConfigManager {
    private configs: Record<string, ModelTimerConfig> = { ...DEFAULT_CONFIGS };
    private chainConfigs: Record<string, ModelChainConfig[]> = {};
    private chainLibrary: ChainItem[] = [];
    private listeners: (() => void)[] = [];
    private initialized = false;
    public models: any[] = [];

    async init() {
        if (this.initialized) return;
        try {
            // Load models metadata first
            const { data: modelData } = await supabase.from('models').select('*');
            if (modelData) {
                this.models = modelData;
            }

            // Load base configs
            const { data: configData } = await supabase.from('model_configs').select('*');
            if (configData) {
                const fetchedConfigs: Record<string, ModelTimerConfig> = { ...DEFAULT_CONFIGS };
                for (const row of configData) {
                    fetchedConfigs[row.model_id] = row.config as ModelTimerConfig;
                }
                this.configs = fetchedConfigs;
            }

            // Load chain configs
            const { data: chainConfigData } = await supabase.from('model_chain_configs').select('*');
            if (chainConfigData) {
                const grouped: Record<string, ModelChainConfig[]> = {};
                for (const row of chainConfigData) {
                    if (!grouped[row.model_id]) grouped[row.model_id] = [];
                    grouped[row.model_id].push(row as ModelChainConfig);
                }
                this.chainConfigs = grouped;
            }

            // Load chain library
            const { data: chainLib } = await supabase.from('chains').select('*');
            if (chainLib) this.chainLibrary = chainLib;

            // Listen for global real-time changes
            supabase.channel('model_configs_channel')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'models' }, () => this.refresh())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'model_configs' }, () => this.refresh())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'model_chain_configs' }, () => this.refresh())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chains' }, () => this.refresh())
                .subscribe();

            this.initialized = true;
            this.notify();
        } catch (e) {
            console.error('Failed to load global timer configs', e);
        }
    }

    async refresh() {
        this.initialized = false;
        await this.init();
    }

    async saveModel(model: any) {
        try {
            const { error } = await supabase.from('models').upsert({
                id: model.id,
                label: model.label,
                image: model.image,
                image_open: model.image_open,
                image_cover: model.image_cover,
                category: model.category,
                tint: model.tint,
                is_active: model.is_active,
                is_event: model.is_event || false,
                event_start: model.event_start || null,
                event_end: model.event_end || null,
                event_title: model.event_title || null,
                event_description: model.event_description || null
            });
            if (error) throw error;
            await this.refresh();
            return true;
        } catch (e) {
            console.error('Failed to save model metadata', e);
            return false;
        }
    }

    getModelImage(modelId: string): string {
        const model = this.models.find(m => m.id === modelId);
        return model?.image || '';
    }

    getModelImageOpen(modelId: string): string {
        const model = this.models.find(m => m.id === modelId);
        return model?.image_open || '';
    }

    getConfig(modelId: string): ModelTimerConfig {
        return this.configs[modelId] || this.configs['beach'] || Object.values(this.configs)[0];
    }

    async saveConfig(modelId: string, config: ModelTimerConfig) {
        try {
            const { error } = await supabase.from('model_configs').upsert({
                model_id: modelId,
                config: config as any,
                theme_color: config.themeColor
            });
            if (error) throw error;

            this.configs[modelId] = config;
            this.notify();
            return true;
        } catch (e) {
            console.error('Failed to save global timer config', e);
            return false;
        }
    }

    getChainConfigs(modelId: string): ModelChainConfig[] {
        return this.chainConfigs[modelId] || [];
    }

    getChainConfig(modelId: string, chainId: string): ModelChainConfig | undefined {
        return this.chainConfigs[modelId]?.find(c => c.chain_id === chainId);
    }

    getChainLibrary(): ChainItem[] {
        return this.chainLibrary;
    }

    async saveChainConfig(config: ModelChainConfig) {
        try {
            const { error } = await supabase.from('model_chain_configs').upsert(config);
            if (error) throw error;

            // Local update
            if (!this.chainConfigs[config.model_id]) this.chainConfigs[config.model_id] = [];
            const idx = this.chainConfigs[config.model_id].findIndex(c => c.chain_id === config.chain_id);
            if (idx >= 0) this.chainConfigs[config.model_id][idx] = config;
            else this.chainConfigs[config.model_id].push(config);
            this.notify();
            return true;
        } catch (e) {
            console.error('Failed to save chain config', e);
            return false;
        }
    }

    async addChainToLibrary(chain: ChainItem) {
        try {
            const { error } = await supabase.from('chains').upsert(chain);
            if (!error) {
                const idx = this.chainLibrary.findIndex(c => c.id === chain.id);
                if (idx >= 0) this.chainLibrary[idx] = chain;
                else this.chainLibrary.push(chain);
                this.notify();
                return true;
            }
        } catch (e) {
            console.error('Failed to add chain to library', e);
        }
        return false;
    }

    subscribe(callback: () => void) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private notify() {
        this.listeners.forEach(l => l());
    }
}

export const timerConfigManager = new TimerConfigManager();
