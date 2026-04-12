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
    is_active: boolean;
}

export interface Drop {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
    created_at?: string;
}

export const DEFAULT_CONFIGS: Record<string, ModelTimerConfig> = {
    basicred_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff4757', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    base_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    lego_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    bubbletea_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    strawberry_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    penguin_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    shark_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    matcha_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    puppy_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    cottoncandy_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    cartoonkap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#3B82F6', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    goldenkap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#EAB308', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    model_1772952082826: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#8B5CF6', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    pioneers_cap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
};

class TimerConfigManager {
    private configs: Record<string, ModelTimerConfig> = { ...DEFAULT_CONFIGS };
    private chainConfigs: Record<string, ModelChainConfig[]> = {};
    private chainLibrary: ChainItem[] = [];
    private drops: Drop[] = [];
    private listeners: (() => void)[] = [];
    private initialized = false;
    public models: any[] = [];

    constructor() {
        this.init = this.init.bind(this);
        this.getModel = this.getModel.bind(this);
        this.getModelImage = this.getModelImage.bind(this);
        this.getModelImageOpen = this.getModelImageOpen.bind(this);
        this.getConfig = this.getConfig.bind(this);
        this.getChainConfigs = this.getChainConfigs.bind(this);
        this.getChainConfig = this.getChainConfig.bind(this);
        this.getDrops = this.getDrops.bind(this);
    }

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

            // Load drops
            const { data: dropData } = await supabase.from('drops').select('*').order('start_date', { ascending: false });
            if (dropData) this.drops = dropData;

            // Listen for global real-time changes
            supabase.channel('model_configs_channel')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'models' }, () => this.refresh())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'model_configs' }, () => this.refresh())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'model_chain_configs' }, () => this.refresh())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chains' }, () => this.refresh())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'drops' }, () => this.refresh())
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

    getModel(modelId: string) {
        return this.models.find(m => m.id === modelId) || null;
    }

    getModelThumbnail(modelId: string): string {
        const model = this.getModel(modelId);
        // We use suffixes in storage instead of a separate DB column
        if (model?.image) {
            return model.image.replace('.webp', '_thumb.webp');
        }
        return model?.image || '';
    }

    getModelImage(modelId: string): string {
        const model = this.getModel(modelId);
        return model?.image || '';
    }

    getModelImageOpen(modelId: string): string {
        const model = this.getModel(modelId);
        // Fallback to closed image if open image is missing
        return model?.image_open || model?.image || '';
    }

    getConfig(modelId: string): ModelTimerConfig {
        return this.configs[modelId] || this.configs['basicred_kap'] || Object.values(this.configs)[0];
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

    getDrops(): Drop[] {
        return this.drops;
    }

    getDrop(dropId: string): Drop | undefined {
        return this.drops.find(d => d.id === dropId);
    }

    subscribe(callback: () => void) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    async saveConfig(modelId: string, config: ModelTimerConfig) {
        try {
            const { error } = await supabase.from('model_configs').upsert({
                model_id: modelId,
                config: config
            }, { onConflict: 'model_id' });
            if (error) throw error;
            await this.refresh();
            return true;
        } catch (e) {
            console.error('Failed to save config', e);
            return false;
        }
    }

    async saveModel(model: any) {
        try {
            const { error } = await supabase.from('models').upsert(model, { onConflict: 'id' });
            if (error) throw error;
            await this.refresh();
            return true;
        } catch (e) {
            console.error('Failed to save model', e);
            return false;
        }
    }

    async saveChainConfig(config: ModelChainConfig) {
        try {
            const { error } = await supabase.from('model_chain_configs').upsert(config, { onConflict: 'model_id,chain_id' });
            if (error) throw error;
            await this.refresh();
            return true;
        } catch (e) {
            console.error('Failed to save chain config', e);
            return false;
        }
    }

    async addChainToLibrary(chain: any) {
        try {
            const { error } = await supabase.from('chains').upsert(chain, { onConflict: 'id' });
            if (error) throw error;
            await this.refresh();
            return true;
        } catch (e) {
            console.error('Failed to add chain', e);
            return false;
        }
    }

    async saveDrop(drop: Partial<Drop>) {
        try {
            const { error } = await supabase.from('drops').upsert(drop, { onConflict: 'id' });
            if (error) throw error;
            await this.refresh();
            return true;
        } catch (e) {
            console.error('Failed to save drop', e);
            return false;
        }
    }

    async deleteDrop(dropId: string) {
        try {
            const { error } = await supabase.from('drops').delete().eq('id', dropId);
            if (error) throw error;
            await this.refresh();
            return true;
        } catch (e) {
            console.error('Failed to delete drop', e);
            return false;
        }
    }

    private notify() {
        this.listeners.forEach(l => l());
    }
}

export const timerConfigManager = new TimerConfigManager();
