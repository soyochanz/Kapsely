import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { CAPSULE_MODELS, MODEL_TINTS } from '../constants/models';

export interface ModelTimerConfig {
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    fontId: string;
    format: 'standard' | 'days';
    curvature: number;
    themeColor: string;
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
    end_date?: string | null;
    is_active: boolean;
    created_at?: string;
}

type ManagedTable = 'models' | 'model_configs' | 'model_chain_configs' | 'chains' | 'drops';

type TimerConfigCache = {
    savedAt: number;
    models: any[];
    hiddenModelIds?: string[];
    configs: Record<string, ModelTimerConfig>;
    chainConfigs: Record<string, ModelChainConfig[]>;
    chainLibrary: ChainItem[];
    drops: Drop[];
};

const TIMER_CONFIG_CACHE_KEY = '@kapsely_timer_config_cache_v3';
const HIDDEN_MODEL_IDS_KEY = '@kapsely_hidden_model_ids_v1';
const TIMER_CONFIG_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const LOAD_TIMEOUT_MS = 4500;
const ALL_TABLES: ManagedTable[] = ['models', 'model_configs', 'model_chain_configs', 'chains', 'drops'];

export const DEFAULT_CONFIGS: Record<string, ModelTimerConfig> = {
    basicred_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#ff4757', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    base_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#a269ff', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    lego_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#F59E0B', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    bubbletea_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#B08968', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    strawberry_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#FB7185', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    penguin_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#94A3B8', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    shark_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#60A5FA', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    matcha_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#34D399', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    puppy_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#FB923C', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    cottoncandy_kap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#F472B6', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    cartoonkap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#3B82F6', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    goldenkap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#EAB308', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    model_1772952082826: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#8B5CF6', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
    pioneers_cap: { x: 0.35, y: 0.42, w: 0.3, h: 0.1, color: '#ffffff', fontId: 'monospace', format: 'standard', curvature: 0, themeColor: '#14B8A6', faceX: 0.5, faceY: 0.54, faceScale: 1, showFace: true },
};

const DEFAULT_MODELS = CAPSULE_MODELS.map(model => ({
    id: model.id,
    label: model.label,
    name: model.label,
    category: model.category,
    image: model.image,
    image_open: model.image_open,
    is_active: true,
    is_new: false,
    is_trending: !!(model as any).is_trending,
    is_birthday: false,
    is_hidden: false,
    drop_id: null,
}));

const withTimeout = async <T,>(promise: any, ms: number, fallback: T): Promise<T> => {
    return await new Promise(resolve => {
        const timer = setTimeout(() => resolve(fallback), ms);
        Promise.resolve(promise as PromiseLike<T>)
            .then(value => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch(() => {
                clearTimeout(timer);
                resolve(fallback);
            });
    });
};

const extractModelStoragePath = (url?: string | null) => {
    if (!url) return null;
    const marker = '/storage/v1/object/public/models/';
    const index = url.indexOf(marker);
    if (index === -1) return null;
    const path = url.slice(index + marker.length).split('?')[0];
    return path || null;
};

const MODEL_DB_KEYS = [
    'id',
    'label',
    'category',
    'image',
    'image_open',
    'tint',
    'is_active',
    'is_hidden',
    'is_new',
    'is_trending',
    'is_event',
    'is_birthday',
    'event_start',
    'event_end',
    'event_title',
    'event_description',
    'drop_id',
    'image_scale',
    'image_scale_x',
    'image_scale_y',
    'image_offset_x',
    'image_offset_y',
    'image_open_scale',
    'image_open_scale_x',
    'image_open_scale_y',
    'image_open_offset_x',
    'image_open_offset_y',
    'effect_type',
    'effect_tint',
    'effect_scale',
    'effect_offset_x',
    'effect_offset_y',
    'effect_opacity',
    'effect_layer',
] as const;

type ModelDbKey = typeof MODEL_DB_KEYS[number];

const sanitizeModelForDb = (input: any) => {
    const payload: Partial<Record<ModelDbKey, any>> = {};

    for (const key of MODEL_DB_KEYS) {
        if (Object.prototype.hasOwnProperty.call(input || {}, key)) {
            payload[key] = input[key];
        }
    }

    payload.id = String(payload.id || input?.id || '').trim();
    payload.label = String(payload.label || input?.label || payload.id || '').trim();
    payload.category = String(payload.category || input?.category || 'Vibe').trim();
    payload.image = String(payload.image || input?.image || '').trim();
    payload.image_open = String(payload.image_open || input?.image_open || payload.image || '').trim();
    payload.tint = String(payload.tint || input?.tint || '#a269ff').trim();
    payload.is_hidden = !!payload.is_hidden;

    payload.is_active = payload.is_active !== false;
    payload.is_new = !!payload.is_new;
    payload.is_trending = !!payload.is_trending;
    payload.is_event = !!payload.is_event;
    payload.is_birthday = !!payload.is_birthday;

    payload.event_start = payload.event_start ? payload.event_start : null;
    payload.event_end = payload.event_end ? payload.event_end : null;
    payload.event_title = payload.event_title ? String(payload.event_title).trim() : '';
    payload.event_description = payload.event_description ? String(payload.event_description).trim() : '';
    payload.drop_id = payload.drop_id ? String(payload.drop_id).trim() : null;

    for (const numericKey of [
        'image_scale',
        'image_scale_x',
        'image_scale_y',
        'image_offset_x',
        'image_offset_y',
        'image_open_scale',
        'image_open_scale_x',
        'image_open_scale_y',
        'image_open_offset_x',
        'image_open_offset_y',
        'effect_scale',
        'effect_offset_x',
        'effect_offset_y',
        'effect_opacity',
    ] as const) {
        const raw = payload[numericKey];
        payload[numericKey] = Number.isFinite(Number(raw)) ? Number(raw) : null;
    }

    payload.effect_type = payload.effect_type ? String(payload.effect_type).trim() : 'none';
    payload.effect_tint = payload.effect_tint ? String(payload.effect_tint).trim() : payload.tint;
    payload.effect_layer = payload.effect_layer ? String(payload.effect_layer).trim() : 'behind';

    return payload;
};

class TimerConfigManager {
    private configs: Record<string, ModelTimerConfig> = { ...DEFAULT_CONFIGS };
    private chainConfigs: Record<string, ModelChainConfig[]> = {};
    private chainLibrary: ChainItem[] = [];
    private drops: Drop[] = [];
    private listeners: (() => void)[] = [];
    private initialized = false;
    private hydratedCache = false;
    private initPromise: Promise<void> | null = null;
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private cacheSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private refreshQueue = new Set<ManagedTable>();
    private channel: any = null;
    public models: any[] = [...DEFAULT_MODELS];
    public lastError: any = null;
    private hiddenModelIds = new Set<string>();

    constructor() {
        this.init = this.init.bind(this);
        this.getModel = this.getModel.bind(this);
        this.getModelImage = this.getModelImage.bind(this);
        this.getModelImageOpen = this.getModelImageOpen.bind(this);
        this.getConfig = this.getConfig.bind(this);
        this.getChainConfigs = this.getChainConfigs.bind(this);
        this.getChainConfig = this.getChainConfig.bind(this);
        this.getDrops = this.getDrops.bind(this);

        void this.hydrateFromCache();
    }

    private mergeModels(models: any[] = [], includeDefaults = true) {
        const merged = new Map<string, any>();
        const hiddenIds = new Set(
            [
                ...Array.from(this.hiddenModelIds),
                ...models
                .filter(model => !!model?.id && (model?.is_hidden === true || model?.is_active === false))
                .map(model => model.id),
            ]
        );
        if (includeDefaults) {
            DEFAULT_MODELS.forEach(model => {
                if (hiddenIds.has(model.id)) return;
                merged.set(model.id, model);
            });
        }
        models.forEach(model => {
            if (!model?.id) return;
            if (hiddenIds.has(model.id)) {
                merged.delete(model.id);
                return;
            }
            merged.set(model.id, { ...(merged.get(model.id) || {}), ...model });
        });
        return Array.from(merged.values());
    }

    private ensureInitStarted() {
        if (!this.initialized && !this.initPromise) {
            void this.init();
        }
    }

    private async hydrateFromCache() {
        if (this.hydratedCache) return;
        this.hydratedCache = true;
        try {
            const persistedHiddenRaw = await AsyncStorage.getItem(HIDDEN_MODEL_IDS_KEY);
            if (persistedHiddenRaw) {
                const parsedHidden = JSON.parse(persistedHiddenRaw);
                if (Array.isArray(parsedHidden)) {
                    this.hiddenModelIds = new Set(parsedHidden.filter(Boolean));
                }
            }

            const raw = await AsyncStorage.getItem(TIMER_CONFIG_CACHE_KEY);
            if (!raw) {
                this.models = this.mergeModels([]);
                this.notify();
                return;
            }
            const parsed = JSON.parse(raw) as TimerConfigCache;
            if (!parsed?.savedAt || Date.now() - parsed.savedAt > TIMER_CONFIG_CACHE_TTL_MS) {
                this.models = this.mergeModels([]);
                this.notify();
                return;
            }

            this.hiddenModelIds = new Set([
                ...Array.from(this.hiddenModelIds),
                ...(Array.isArray(parsed.hiddenModelIds) ? parsed.hiddenModelIds : []),
            ]);
            this.models = this.mergeModels(Array.isArray(parsed.models) ? parsed.models : []);
            this.configs = { ...DEFAULT_CONFIGS, ...(parsed.configs || {}) };
            this.chainConfigs = parsed.chainConfigs || {};
            this.chainLibrary = Array.isArray(parsed.chainLibrary) ? parsed.chainLibrary : [];
            this.drops = Array.isArray(parsed.drops) ? parsed.drops : [];
            this.notify();
        } catch (error) {
            console.warn('[TimerConfig] Failed to hydrate cache', error);
        }
    }

    private scheduleCacheSave() {
        if (this.cacheSaveTimer) clearTimeout(this.cacheSaveTimer);
        this.cacheSaveTimer = setTimeout(() => {
            void this.persistCache();
        }, 180);
    }

    private async persistHiddenModelIds() {
        try {
            await AsyncStorage.setItem(HIDDEN_MODEL_IDS_KEY, JSON.stringify(Array.from(this.hiddenModelIds)));
        } catch (error) {
            console.warn('[TimerConfig] Failed to persist hidden model ids', error);
        }
    }

    private async persistCache() {
        try {
            const payload: TimerConfigCache = {
                savedAt: Date.now(),
                models: this.models,
                hiddenModelIds: Array.from(this.hiddenModelIds),
                configs: this.configs,
                chainConfigs: this.chainConfigs,
                chainLibrary: this.chainLibrary,
                drops: this.drops,
            };
            await AsyncStorage.setItem(TIMER_CONFIG_CACHE_KEY, JSON.stringify(payload));
        } catch (error) {
            console.warn('[TimerConfig] Failed to persist cache', error);
        }
    }

    private ensureChannel() {
        if (this.channel) return;

        this.channel = supabase.channel('model_configs_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'models' }, () => this.queueRefresh(['models']))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'model_configs' }, () => this.queueRefresh(['model_configs']))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'model_chain_configs' }, () => this.queueRefresh(['model_chain_configs']))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chains' }, () => this.queueRefresh(['chains']))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drops' }, () => this.queueRefresh(['drops']))
            .subscribe();
    }

    private queueRefresh(tables: ManagedTable[]) {
        tables.forEach(table => this.refreshQueue.add(table));
        if (this.refreshTimer) return;

        this.refreshTimer = setTimeout(() => {
            const pendingTables = Array.from(this.refreshQueue);
            this.refreshQueue.clear();
            this.refreshTimer = null;
            void this.loadTables(pendingTables, true);
        }, 180);
    }

    private async loadModels() {
        const fallback = { data: null as any, error: null };
        const { data } = await withTimeout(
            supabase.from('models').select('*').order('is_active', { ascending: false }).order('created_at', { ascending: false }),
            LOAD_TIMEOUT_MS,
            fallback
        );
        if (Array.isArray(data) && data.length > 0) {
            this.models = this.mergeModels(data, false);
        } else {
            this.models = this.mergeModels([]);
        }
    }

    private async loadModelConfigs() {
        const fallback = { data: null as any, error: null };
        const { data } = await withTimeout(
            supabase.from('model_configs').select('*'),
            LOAD_TIMEOUT_MS,
            fallback
        );
        if (Array.isArray(data)) {
            const fetchedConfigs: Record<string, ModelTimerConfig> = { ...DEFAULT_CONFIGS };
            for (const row of data) {
                if (!row?.model_id || !row?.config) continue;
                fetchedConfigs[row.model_id] = row.config as ModelTimerConfig;
            }
            this.configs = fetchedConfigs;
        }
    }

    private async loadModelChainConfigs() {
        const fallback = { data: null as any, error: null };
        const { data } = await withTimeout(
            supabase.from('model_chain_configs').select('*'),
            LOAD_TIMEOUT_MS,
            fallback
        );
        if (Array.isArray(data)) {
            const grouped: Record<string, ModelChainConfig[]> = {};
            for (const row of data) {
                if (!row?.model_id) continue;
                if (!grouped[row.model_id]) grouped[row.model_id] = [];
                grouped[row.model_id].push(row as ModelChainConfig);
            }
            this.chainConfigs = grouped;
        }
    }

    private async loadChainLibrary() {
        const fallback = { data: null as any, error: null };
        const { data } = await withTimeout(
            supabase.from('chains').select('*').order('is_active', { ascending: false }).order('created_at', { ascending: false }),
            LOAD_TIMEOUT_MS,
            fallback
        );
        if (Array.isArray(data)) {
            this.chainLibrary = data;
        }
    }

    private async loadDrops() {
        const fallback = { data: null as any, error: null };
        const { data } = await withTimeout(
            supabase.from('drops').select('*').order('start_date', { ascending: false }),
            LOAD_TIMEOUT_MS,
            fallback
        );
        if (Array.isArray(data)) {
            this.drops = data;
        }
    }

    private async loadTables(tables: ManagedTable[], notify = false) {
        const loaders: Promise<void>[] = [];
        const tableSet = new Set(tables);

        if (tableSet.has('models')) loaders.push(this.loadModels());
        if (tableSet.has('model_configs')) loaders.push(this.loadModelConfigs());
        if (tableSet.has('model_chain_configs')) loaders.push(this.loadModelChainConfigs());
        if (tableSet.has('chains')) loaders.push(this.loadChainLibrary());
        if (tableSet.has('drops')) loaders.push(this.loadDrops());

        await Promise.all(loaders);
        this.initialized = true;
        this.scheduleCacheSave();
        if (notify) this.notify();
    }

    async init(force = false) {
        await this.hydrateFromCache();
        if (this.initialized && !force) {
            this.ensureChannel();
            return;
        }
        if (this.initPromise && !force) return this.initPromise;

        this.initPromise = (async () => {
            try {
                await this.loadTables(['models', 'model_configs'], true);
                this.ensureChannel();
                void this.loadTables(['model_chain_configs', 'chains', 'drops'], true);
            } catch (error) {
                console.error('Failed to load global timer configs', error);
            }
        })();

        try {
            await this.initPromise;
        } finally {
            this.initPromise = null;
        }
    }

    async refresh(tables: ManagedTable[] = ALL_TABLES) {
        await this.init();
        await this.loadTables(tables, true);
    }

    getModel(modelId: string) {
        this.ensureInitStarted();
        return this.models.find(model => model.id === modelId) || DEFAULT_MODELS.find(model => model.id === modelId) || null;
    }

    getModelThumbnail(modelId: string): string {
        const model = this.getModel(modelId);
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
        return model?.image_open || model?.image || '';
    }

    getModelThemeColor(modelId: string, modelSnapshot?: any, fallback = '#a269ff'): string {
        this.ensureInitStarted();
        return modelSnapshot?.themeColor
            || this.getConfig(modelId)?.themeColor
            || modelSnapshot?.tint
            || (MODEL_TINTS as Record<string, string>)[modelId]
            || this.getModel(modelId)?.tint
            || fallback;
    }

    getConfig(modelId: string): ModelTimerConfig {
        this.ensureInitStarted();
        return this.configs[modelId] || this.configs.base_kap || Object.values(this.configs)[0];
    }

    getChainConfigs(modelId: string): ModelChainConfig[] {
        this.ensureInitStarted();
        return this.chainConfigs[modelId] || [];
    }

    getChainConfig(modelId: string, chainId: string): ModelChainConfig | undefined {
        this.ensureInitStarted();
        return this.chainConfigs[modelId]?.find(config => config.chain_id === chainId);
    }

    getChainLibrary(): ChainItem[] {
        this.ensureInitStarted();
        return this.chainLibrary;
    }

    getDrops(): Drop[] {
        this.ensureInitStarted();
        return this.drops;
    }

    getDrop(dropId: string): Drop | undefined {
        this.ensureInitStarted();
        return this.drops.find(drop => drop.id === dropId);
    }

    subscribe(callback: () => void) {
        this.listeners.push(callback);
        void this.init();
        return () => {
            this.listeners = this.listeners.filter(listener => listener !== callback);
        };
    }

    async saveConfig(modelId: string, config: ModelTimerConfig) {
        try {
            const { error } = await supabase.from('model_configs').upsert({
                model_id: modelId,
                config,
            }, { onConflict: 'model_id' });
            if (error) throw error;
            await this.refresh(['model_configs']);
            return true;
        } catch (error) {
            console.error('Failed to save config', error);
            return false;
        }
    }

    async saveModel(model: any) {
        try {
            this.lastError = null;
            const payload = sanitizeModelForDb(model);
            const { error } = await supabase.from('models').upsert(payload, { onConflict: 'id' });
            if (error) {
                this.lastError = error;
                throw error;
            }
            if (payload.is_hidden || payload.is_active === false) {
                this.hiddenModelIds.add(payload.id);
            } else {
                this.hiddenModelIds.delete(payload.id);
            }
            await this.persistHiddenModelIds();
            await this.refresh(['models']);
            return true;
        } catch (error) {
            console.error('Failed to save model', { error, model });
            this.lastError = error;
            return false;
        }
    }

    async saveChainConfig(config: ModelChainConfig) {
        try {
            const { error } = await supabase.from('model_chain_configs').upsert(config, { onConflict: 'model_id,chain_id' });
            if (error) throw error;
            await this.refresh(['model_chain_configs']);
            return true;
        } catch (error) {
            console.error('Failed to save chain config', error);
            return false;
        }
    }

    async addChainToLibrary(chain: any) {
        try {
            const { error } = await supabase.from('chains').upsert(chain, { onConflict: 'id' });
            if (error) throw error;
            await this.refresh(['chains']);
            return true;
        } catch (error) {
            console.error('Failed to add chain', error);
            return false;
        }
    }

    async deleteChain(chainId: string) {
        try {
            this.lastError = null;
            await supabase.from('model_chain_configs').delete().eq('chain_id', chainId);
            const { error } = await supabase.from('chains').delete().eq('id', chainId);
            if (error) {
                this.lastError = error;
                throw error;
            }
            await this.refresh(['model_chain_configs', 'chains']);
            return true;
        } catch (error) {
            console.error('Failed to delete chain', error);
            this.lastError = error;
            return false;
        }
    }

    async saveDrop(drop: Partial<Drop>) {
        try {
            const { id, ...insertPayload } = drop as any;
            const { error } = id
                ? await supabase.from('drops').upsert({ id, ...insertPayload }, { onConflict: 'id' })
                : await supabase.from('drops').insert(insertPayload);
            if (error) throw error;
            await this.refresh(['drops']);
            return true;
        } catch (error) {
            console.error('Failed to save drop', error);
            return false;
        }
    }

    async deleteDrop(dropId: string) {
        try {
            const { error } = await supabase.from('drops').delete().eq('id', dropId);
            if (error) throw error;
            await this.refresh(['drops']);
            return true;
        } catch (error) {
            console.error('Failed to delete drop', error);
            return false;
        }
    }

    async deleteModel(modelId: string) {
        try {
            this.lastError = null;
            const existingModel = this.getModel(modelId);
            const isDefaultModel = DEFAULT_MODELS.some(model => model.id === modelId);
            const archivePayload = sanitizeModelForDb({
                ...(existingModel || {}),
                id: modelId,
                is_active: false,
                is_hidden: true,
            });
            await supabase.from('model_configs').delete().eq('model_id', modelId);
            await supabase.from('model_chain_configs').delete().eq('model_id', modelId);

            const { error } = isDefaultModel
                ? await supabase
                    .from('models')
                    .upsert(archivePayload as any, { onConflict: 'id' })
                : await supabase.from('models').delete().eq('id', modelId);
            if (error) {
                let archiveError: any = null;

                const archiveWithHidden = await supabase
                    .from('models')
                    .update(archivePayload as any)
                    .eq('id', modelId);

                archiveError = archiveWithHidden.error;

                if (archiveError) {
                    const archiveMessage = String(archiveError?.message || '').toLowerCase();
                    const hiddenColumnMissing = archiveMessage.includes('is_hidden') || archiveMessage.includes('schema cache');

                    if (hiddenColumnMissing) {
                        const archiveWithoutHidden = await supabase
                            .from('models')
                            .update({ is_active: false } as any)
                            .eq('id', modelId);
                        archiveError = archiveWithoutHidden.error;
                    }
                }

                if (archiveError) {
                    // Some default models do not exist as full DB rows and PostgREST may reject the tombstone upsert.
                    // In that case we still hide them locally so they stop reappearing in Calibration Tool.
                    this.lastError = archiveError;
                    if (!isDefaultModel) {
                        throw archiveError;
                    }
                }

                this.hiddenModelIds.add(modelId);
                await this.persistHiddenModelIds();
                this.models = this.models.filter(model => model.id !== modelId);
                this.scheduleCacheSave();
                this.notify();
                await this.refresh(['models', 'model_configs', 'model_chain_configs']);
                return true;
            }

            const storagePaths = [
                extractModelStoragePath(existingModel?.image),
                extractModelStoragePath(existingModel?.image_open),
            ].filter(Boolean) as string[];

            const thumbPaths = storagePaths
                .filter(path => path.endsWith('.webp'))
                .map(path => path.replace(/\.webp$/i, '_thumb.webp'));

            const pathsToDelete = Array.from(new Set([...storagePaths, ...thumbPaths]));
            if (pathsToDelete.length > 0) {
                const { error: storageError } = await supabase.storage.from('models').remove(pathsToDelete);
                if (storageError) {
                    console.warn('Failed to delete model storage assets', storageError);
                }
            }

            this.hiddenModelIds.add(modelId);
            await this.persistHiddenModelIds();
            this.models = this.models.filter(model => model.id !== modelId);
            this.scheduleCacheSave();
            this.notify();
            await this.refresh(['models', 'model_configs', 'model_chain_configs']);
            return true;
        } catch (error) {
            console.error('Failed to delete model', error);
            this.lastError = error;
            return false;
        }
    }

    private notify() {
        this.listeners.forEach(listener => listener());
    }
}

export const timerConfigManager = new TimerConfigManager();
