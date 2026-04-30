import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, 
  Settings, 
  Users, 
  BarChart3, 
  Zap, 
  Sliders, 
  Plus, 
  Trash2, 
  Save, 
  RefreshCw,
  Search,
  Lock,
  Clock,
  ChevronRight,
  Maximize2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getModelImage } from '../constants/models';
import CapsuleWithTimer from './CapsuleWithTimer';

export const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'calibration' | 'users' | 'reports'>('calibration');
  const [loading, setLoading] = useState(false);

  return (
    <div className="admin-panel-premium">
      <header className="admin-header">
        <div className="admin-title">
          <div className="admin-icon-glow">
            <ShieldCheck size={24} color="var(--primary)" />
          </div>
          <div>
            <h1>Admin Control Center</h1>
            <p>Platform management & configuration</p>
          </div>
        </div>

        <nav className="admin-tabs">
          <button 
            className={`admin-tab-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <BarChart3 size={18} /> Overview
          </button>
          <button 
            className={`admin-tab-item ${activeTab === 'calibration' ? 'active' : ''}`}
            onClick={() => setActiveTab('calibration')}
          >
            <Sliders size={18} /> Calibration
          </button>
          <button 
            className={`admin-tab-item ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={18} /> Users
          </button>
          <button 
            className={`admin-tab-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <AlertCircle size={18} /> Reports
          </button>
        </nav>
      </header>

      <main className="admin-content-area">
        <AnimatePresence mode="wait">
          {activeTab === 'calibration' && (
            <motion.div
              key="calibration"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="calibration-container"
            >
              <CalibrationTool />
            </motion.div>
          )}

          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="admin-placeholder"
            >
              <div className="placeholder-card">
                <BarChart3 size={48} color="var(--primary)" />
                <h2>Analytics Overview</h2>
                <p>Platform metrics and health status will appear here.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="admin-placeholder"
            >
              <div className="placeholder-card">
                <Users size={48} color="var(--primary)" />
                <h2>User Management</h2>
                <p>Search, moderate, and manage user accounts.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

const CalibrationTool = () => {
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({
    x: 0.5,
    y: 0.8,
    w: 0.8,
    h: 0.1,
    color: '#ffffff',
    format: 'standard' as 'standard' | 'days',
    fontId: 'Inter_700Bold'
  });
  const [isSaving, setIsSaving] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('models').select('*').order('label');
    if (!error && data) {
      setModels(data);
      if (data.length > 0) handleModelSelect(data[0]);
    }
    setLoading(false);
  };

  const fetchConfig = async (modelId: string) => {
    const { data } = await supabase
      .from('model_configs')
      .select('*')
      .eq('model_id', modelId)
      .maybeSingle();
    
    if (data) {
      const configData = data.config || data;
      setConfig({
        x: configData.x,
        y: configData.y,
        w: configData.w,
        h: configData.h,
        color: configData.color || '#ffffff',
        format: configData.format || 'standard',
        fontId: configData.font_id || configData.fontId || 'Inter_700Bold'
      });
    } else {
      // Default
      setConfig({
        x: 0.5,
        y: 0.8,
        w: 0.8,
        h: 0.1,
        color: '#ffffff',
        format: 'standard',
        fontId: 'Inter_700Bold'
      });
    }
  };

  const handleModelSelect = (model: any) => {
    setSelectedModel(model);
    fetchConfig(model.id);
  };

  const handleSave = async () => {
    if (!selectedModel) return;
    setIsSaving(true);
    const { error } = await supabase.from('model_configs').upsert({
      model_id: selectedModel.id,
      config: {
        x: config.x,
        y: config.y,
        w: config.w,
        h: config.h,
        color: config.color,
        format: config.format,
        fontId: config.fontId
      },
      updated_at: new Date().toISOString()
    }, { onConflict: 'model_id' });

    if (error) {
      alert('Error saving config: ' + error.message);
    } else {
      // Toast or feedback
      alert('Configuration saved successfully!');
    }
    setIsSaving(false);
  };

  const updateConfig = (updates: Partial<typeof config>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  if (loading) return <div className="admin-loading"><RefreshCw className="spin" /> Loading models...</div>;

  return (
    <div className="calibration-layout">
      <div className="model-selector-sidebar">
        <div className="sidebar-header">
          <h3>Models</h3>
          <button className="add-mini-btn"><Plus size={16} /></button>
        </div>
        <div className="model-list-scroll">
          {models.map(m => (
            <button 
              key={m.id}
              className={`model-list-item ${selectedModel?.id === m.id ? 'active' : ''}`}
              onClick={() => handleModelSelect(m)}
            >
              <img src={m.image} alt="" />
              <span>{m.label}</span>
              {selectedModel?.id === m.id && <ChevronRight size={16} />}
            </button>
          ))}
        </div>
      </div>

      <div className="calibration-workspace">
        <div className="preview-container">
          <div className="preview-header">
            <h3>Visual Calibration</h3>
            <div className="preview-actions">
              <button onClick={() => updateConfig({ x: 0.5, y: 0.5 })}><Maximize2 size={16} /> Center</button>
              <button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <RefreshCw className="spin" size={16} /> : <Save size={16} />} 
                {isSaving ? 'Saving...' : 'Save Config'}
              </button>
            </div>
          </div>

          <div className="calibration-frame-wrapper">
            <div className="calibration-frame" ref={frameRef}>
               {selectedModel && (
                 <CapsuleWithTimer 
                   modelKey={selectedModel.id}
                   source={selectedModel.image}
                   date={new Date(Date.now() + 86400000).toISOString()} // Preview with 1 day
                   style={{ width: '100%', height: '100%' }}
                   configOverride={{
                     model_id: selectedModel.id,
                     x: config.x,
                     y: config.y,
                     w: config.w,
                     h: config.h,
                     color: config.color,
                     format: config.format,
                     font_id: config.fontId,
                     curvature: 0 // TODO: Add curvature slider to admin if needed
                   }}
                 />
               )}
            </div>
          </div>
          
          <p className="helper-text">Previewing at 1:1 scale relative to container</p>
        </div>

        <div className="calibration-controls-panel">
          <div className="controls-group">
            <h4>Position & Size</h4>
            <div className="control-row">
              <label>X Position ({Math.round(config.x * 100)}%)</label>
              <input 
                type="range" min="0" max="1" step="0.01" 
                value={config.x} 
                onChange={(e) => updateConfig({ x: parseFloat(e.target.value) })} 
              />
            </div>
            <div className="control-row">
              <label>Y Position ({Math.round(config.y * 100)}%)</label>
              <input 
                type="range" min="0" max="1" step="0.01" 
                value={config.y} 
                onChange={(e) => updateConfig({ y: parseFloat(e.target.value) })} 
              />
            </div>
            <div className="control-grid">
              <div className="control-row">
                <label>Width ({Math.round(config.w * 100)}%)</label>
                <input 
                  type="range" min="0.1" max="1" step="0.01" 
                  value={config.w} 
                  onChange={(e) => updateConfig({ w: parseFloat(e.target.value) })} 
                />
              </div>
              <div className="control-row">
                <label>Height ({Math.round(config.h * 100)}%)</label>
                <input 
                  type="range" min="0.05" max="0.5" step="0.01" 
                  value={config.h} 
                  onChange={(e) => updateConfig({ h: parseFloat(e.target.value) })} 
                />
              </div>
            </div>
          </div>

          <div className="controls-group">
            <h4>Style & Format</h4>
            <div className="control-row">
              <label>Color</label>
              <div className="color-picker-custom">
                <input 
                  type="color" 
                  value={config.color} 
                  onChange={(e) => updateConfig({ color: e.target.value })} 
                />
                <span>{config.color}</span>
              </div>
            </div>
            <div className="control-row">
              <label>Format</label>
              <div className="toggle-group">
                <button 
                  className={config.format === 'standard' ? 'active' : ''}
                  onClick={() => updateConfig({ format: 'standard' })}
                >
                  H:M:S
                </button>
                <button 
                  className={config.format === 'days' ? 'active' : ''}
                  onClick={() => updateConfig({ format: 'days' })}
                >
                  Days
                </button>
              </div>
            </div>
          </div>
          
          <div className="status-indicator">
            <CheckCircle2 size={16} /> All changes are local until saved
          </div>
        </div>
      </div>
    </div>
  );
};
