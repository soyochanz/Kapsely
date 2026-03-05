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
}

export const DEFAULT_CONFIGS: Record<string, ModelTimerConfig> = {
    beach: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#0ea5e9' },
    burger: { x: 0.35, y: 0.52, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#e67e22' },
    cake: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ec4899' },
    china: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff4757' },
    choco: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#5d4037' },
    disco: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff' },
    dragon: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff1493' },
    dubai: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#d4a017' },
    galaxy: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#4b0082' },
    greenlime: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#6abf69' },
    h2o: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#00d2ff' },
    lava: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff4500' },
    orange: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff8c00' },
    pink: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff69b4' },
    poke: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff0000' },
    rocket: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#708090' },
    star: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ffd700' },
    travel: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#2ed573' },
    cottoncandy: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ffacf5' },
    cookies: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#c56cf0' },
    glowjelly: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a29bfe' },
    shark: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#2f3542' },
    dog: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ffa502' },
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
            const { error } = await supabase.from('models').upsert(model);
            if (error) throw error;
            await this.refresh();
            return true;
        } catch (e) {
            console.error('Failed to save model metadata', e);
            return false;
        }
    }

    getConfig(modelId: string): ModelTimerConfig {
        return this.configs[modelId] || this.configs['classic'];
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
