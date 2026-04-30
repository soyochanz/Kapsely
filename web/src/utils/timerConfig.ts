import { supabase } from '../lib/supabase';

export interface ModelTimerConfig {
  model_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  format: 'standard' | 'days';
  font_id: string;
  curvature: number;
}

export interface ModelChainConfig {
  model_id: string;
  chain_id: string;
  x: number;
  y: number;
  scale: number;
  is_active: boolean;
}

class TimerConfigManager {
  private configs: Record<string, ModelTimerConfig> = {};
  private chainConfigs: Record<string, ModelChainConfig[]> = {};
  private chainLibrary: any[] = [];
  private models: any[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    this.init();
  }

  async init() {
    try {
      const [timerRes, chainRes, libRes, modelRes] = await Promise.all([
        supabase.from('model_configs').select('*'),
        supabase.from('model_chain_configs').select('*'),
        supabase.from('chains').select('*'),
        supabase.from('models').select('*').order('label')
      ]);

      if (timerRes.data) {
        timerRes.data.forEach(c => {
          // In mobile, 'config' is a JSON field
          const configData = c.config || c;
          this.configs[c.model_id] = {
            model_id: c.model_id,
            x: configData.x,
            y: configData.y,
            w: configData.w,
            h: configData.h,
            color: configData.color || '#ffffff',
            format: configData.format || 'standard',
            font_id: configData.font_id || configData.fontId || 'Inter_700Bold',
            curvature: configData.curvature || 0
          };
        });
      }

      if (chainRes.data) {
        chainRes.data.forEach(c => {
          if (!this.chainConfigs[c.model_id]) this.chainConfigs[c.model_id] = [];
          this.chainConfigs[c.model_id].push(c);
        });
      }

      if (libRes.data) this.chainLibrary = libRes.data;
      if (modelRes.data) this.models = modelRes.data;

      this.notify();
    } catch (e) {
      console.error('Error initializing TimerConfigManager:', e);
    }
  }

  getConfig(modelId: string): ModelTimerConfig {
    return this.configs[modelId] || {
      model_id: modelId,
      x: 0.5,
      y: 0.8,
      w: 0.8,
      h: 0.1,
      color: '#ffffff',
      format: 'standard',
      font_id: 'Inter_700Bold',
      curvature: 0
    };
  }

  getChainConfig(modelId: string, chainId: string): ModelChainConfig | null {
    return this.chainConfigs[modelId]?.find(c => c.chain_id === chainId) || null;
  }

  getChainLibrary() {
    return this.chainLibrary;
  }

  getModels() {
    return this.models;
  }

  getModel(modelId: string) {
    return this.models.find(m => m.id === modelId) || null;
  }

  getModelImage(modelId: string): string | null {
    const model = this.getModel(modelId);
    return model?.image || null;
  }

  getModelImageOpen(modelId: string): string | null {
    const model = this.getModel(modelId);
    return model?.image_open || model?.image || null;
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

  async refresh() {
    await this.init();
  }
}

export const timerConfigManager = new TimerConfigManager();
