import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Layers, Lock, Globe, ChevronRight, ChevronLeft, Check, Sparkles, Clock, Users, ArrowLeft, Calendar, Info, Grid3X3, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CAPSULE_MODELS as MODELS, getModelImage, TYPE_CFG, getModelImageOpen } from '../constants/models';

interface CreateCapsuleProps {
  onClose: () => void;
}

type Step = 'mode' | 'design' | 'identity' | 'timing' | 'review' | 'animating';

export const CreateCapsule: React.FC<CreateCapsuleProps> = ({ onClose }) => {
  const [step, setStep] = useState<Step>('mode');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [model, setModel] = useState(MODELS[1].id);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isShared, setIsShared] = useState(false);
  const [opensAt, setOpensAt] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(7);
  const [showModelGrid, setShowModelGrid] = useState(false);
  const [carouselDirection, setCarouselDirection] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSealAnim, setShowSealAnim] = useState(false);

  const steps: Step[] = selectedType === 'opencap' 
    ? ['mode', 'design', 'identity', 'review'] 
    : ['mode', 'design', 'identity', 'timing', 'review'];

  const stepIndex = steps.indexOf(step);

  const handleCreate = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const isSealed = selectedType !== 'opencap';
      const computedOpenDate = isSealed
        ? (opensAt || new Date(Date.now() + 86400000 * (selectedPreset || 7)).toISOString())
        : null;
      
      const { error: insertError } = await supabase
        .from('capsules')
        .insert({
          owner_id: user.id,
          title: title.trim(),
          description: description.trim(),
          type: selectedType === 'opencap' ? 'instacap' : selectedType,
          is_public: isPublic,
          is_shared: isShared,
          model,
          opens_at: computedOpenDate,
          duration_days: isSealed ? (selectedPreset || 7) : 0,
          status: isSealed ? 'sealed' : 'opened'
        });

      if (insertError) throw insertError;
      
      setStep('animating');
      setShowSealAnim(true);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const currentModel = MODELS.find(m => m.id === model) || MODELS[1];
  const typeInfo = selectedType ? TYPE_CFG[selectedType] : null;
  const modelIndex = Math.max(0, MODELS.findIndex(m => m.id === model));
  const presets = [
    { label: '1 noche', days: 1, icon: 'moon' },
    { label: '1 semana', days: 7, icon: 'zap' },
    { label: '1 mes', days: 30, icon: 'calendar' },
    { label: '1 año', days: 365, icon: 'sun' },
    { label: '5 años', days: 365 * 5, icon: 'archive' },
  ];
  const selectModelAt = (nextIndex: number) => {
    const normalized = (nextIndex + MODELS.length) % MODELS.length;
    setCarouselDirection(normalized > modelIndex || (modelIndex === MODELS.length - 1 && normalized === 0) ? 1 : -1);
    setModel(MODELS[normalized].id);
  };
  const modeOptions = [
    {
      key: 'instacap',
      label: 'Capsula cerrada',
      tagline: 'Guarda recuerdos y abrelos en una fecha futura.',
      limit: 'Incluye timer y bloqueo hasta su apertura',
      emoji: '🔒',
      accent: '#7C5CBF',
      light: '#F3F1FE',
    },
    {
      key: 'opencap',
      label: 'Capsula abierta',
      tagline: 'Publica y comparte recuerdos sin cuenta atras.',
      limit: 'Siempre visible segun su privacidad',
      emoji: '🌍',
      accent: '#10B981',
      light: '#ECFDF5',
    },
  ];

  if (step === 'animating') {
     return (
       <div className="seal-anim-overlay">
          <SealAnimation 
            accent={typeInfo?.accent || '#7C5CBF'} 
            modelUri={getModelImage(model)} 
            modelOpenUri={getModelImageOpen(model)}
            onDone={onClose}
            isOpen={selectedType === 'opencap'}
          />
       </div>
     );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="modal-content glass-card create-capsule-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header-premium">
           <div className="header-left">
              <button onClick={onClose} className="back-btn-circle"><X size={20} /></button>
              <div>
                <h2>New Capsule</h2>
                <p>Step {stepIndex + 1} of {steps.length}</p>
              </div>
           </div>
           <div className="step-pills">
              {steps.map((s, i) => (
                <div key={s} className={`step-pill ${i <= stepIndex ? 'active' : ''}`} style={{'--accent': typeInfo?.accent || 'var(--primary)'} as any} />
              ))}
           </div>
        </div>

        <div className="create-scroll-area">
          <AnimatePresence mode="wait">
            {step === 'mode' && (
              <motion.div 
                key="mode"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="step-view"
              >
                <div className="step-header">
                  <span className="step-tag">Step 1</span>
                  <h3>Tipo de capsula</h3>
                  <p>Elige como quieres crearla, igual que en la app.</p>
                </div>
                
                <div className="type-list-premium">
                  {modeOptions.map((cfg: any) => (
                    <button 
                      key={cfg.key}
                      className={`type-option-card ${selectedType === cfg.key ? 'active' : ''}`}
                      style={{'--accent': cfg.accent, '--bg-light': cfg.light} as any}
                      onClick={() => {
                        setSelectedType(cfg.key);
                        setStep('design');
                      }}
                    >
                      <div className="type-option-icon">{cfg.emoji}</div>
                      <div className="type-option-content">
                        <div className="type-option-title">
                           {cfg.label}
                           {selectedType === cfg.key && <Check size={14} className="check-icon" />}
                        </div>
                        <p>{cfg.tagline}</p>
                        <div className="type-option-meta">
                          <Info size={12} /> {cfg.limit}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="actions-footer">
                  <button 
                    className="primary-btn-premium" 
                    disabled={!selectedType} 
                    onClick={() => setStep('design')}
                    style={{'--accent': typeInfo?.accent || 'var(--primary)'} as any}
                  >
                    Continue <ChevronRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'design' && (
              <motion.div 
                key="design"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="step-view"
              >
                <div className="step-header">
                  <span className="step-tag" style={{background: typeInfo?.accent+'20', color: typeInfo?.accent}}>Step 2</span>
                  <h3>Diseno</h3>
                  <p>Elige el diseno de tu capsula.</p>
                </div>

                <div className="model-selection-area">
                   <div className="model-carousel-panel" style={{'--accent': typeInfo?.accent || 'var(--primary)'} as any}>
                      <button className="carousel-arrow left" onClick={() => selectModelAt(modelIndex - 1)} aria-label="Previous design">
                        <ChevronLeft size={24} />
                      </button>
                      <div className="carousel-stage">
                        <AnimatePresence mode="popLayout" custom={carouselDirection}>
                          <motion.div
                            key={model}
                            custom={carouselDirection}
                            initial={{ opacity: 0, x: carouselDirection >= 0 ? 80 : -80, rotate: carouselDirection >= 0 ? 6 : -6, scale: 0.92 }}
                            animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
                            exit={{ opacity: 0, x: carouselDirection >= 0 ? -80 : 80, rotate: carouselDirection >= 0 ? -6 : 6, scale: 0.92 }}
                            transition={{ type: 'spring', stiffness: 240, damping: 24 }}
                            className="carousel-capsule-wrap"
                          >
                            <img src={getModelImage(model)} alt={currentModel.label} />
                          </motion.div>
                        </AnimatePresence>
                      </div>
                      <button className="carousel-arrow right" onClick={() => selectModelAt(modelIndex + 1)} aria-label="Next design">
                        <ChevronRight size={24} />
                      </button>
                      <div className="carousel-model-copy">
                        <h4>{currentModel.label}</h4>
                        <p>{currentModel.description}</p>
                        <span>{modelIndex + 1} / {MODELS.length}</span>
                      </div>
                   </div>

                   <div className="model-side-panel">
                    <button className="grid-toggle-btn" onClick={() => setShowModelGrid(prev => !prev)}>
                      <Grid3X3 size={16} /> {showModelGrid ? 'Ocultar cuadricula' : 'Ver cuadricula'}
                    </button>
                    {showModelGrid && (
                     <div className="model-grid-premium">
                      {MODELS.map((m, index) => (
                        <button 
                          key={m.id} 
                          className={`model-item-sm ${model === m.id ? 'active' : ''}`}
                          onClick={() => {
                            setCarouselDirection(index >= modelIndex ? 1 : -1);
                            setModel(m.id);
                          }}
                          style={{'--accent': typeInfo?.accent} as any}
                        >
                          <img src={getModelImage(m.id)} alt={m.label} />
                        </button>
                      ))}
                     </div>
                    )}
                   </div>
                </div>

                <div className="actions-footer">
                  <button className="secondary-btn-premium" onClick={() => setStep('mode')}>
                    <ArrowLeft size={20} /> Back
                  </button>
                  <button 
                    className="primary-btn-premium" 
                    onClick={() => setStep('identity')}
                    style={{'--accent': typeInfo?.accent || 'var(--primary)'} as any}
                  >
                    Looks good <ChevronRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'identity' && (
              <motion.div 
                key="identity"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="step-view"
              >
                <div className="step-header">
                  <span className="step-tag" style={{background: typeInfo?.accent+'20', color: typeInfo?.accent}}>Step 3</span>
                  <h3>Identidad</h3>
                  <p>Nombre, descripcion y privacidad de la capsula.</p>
                </div>

                <div className="form-premium">
                   <div className="input-group-premium">
                      <label>Nombre de la capsula</label>
                      <input 
                        type="text" 
                        placeholder="Mi viaje, mi familia, verano 2026..." 
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        autoFocus
                      />
                   </div>
                   <div className="input-group-premium">
                      <label>Descripcion</label>
                      <textarea 
                        placeholder="Cuenta que recuerdos va a guardar esta capsula..." 
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={3}
                      />
                   </div>
                   <div className="input-group-premium">
                      <label>Visibility</label>
                      <div className="visibility-toggle-premium">
                         <button className={isPublic ? 'active' : ''} onClick={() => setIsPublic(true)}>
                            <Globe size={18} /> <span>Public</span>
                         </button>
                         <button className={!isPublic ? 'active' : ''} onClick={() => setIsPublic(false)}>
                            <Lock size={18} /> <span>Private</span>
                         </button>
                      </div>
                      <p className="hint-text">
                        {isPublic ? 'Visible to everyone on the discovery feed.' : 'Only people you invite can see this capsule.'}
                      </p>
                   </div>
                   <div className="input-group-premium">
                      <label>Capsula compartida</label>
                      <button className={`shared-toggle-card ${isShared ? 'active' : ''}`} onClick={() => setIsShared(prev => !prev)} style={{'--accent': typeInfo?.accent || 'var(--primary)'} as any}>
                        <Users size={18} />
                        <div>
                          <strong>{isShared ? 'Compartida activada' : 'Crear solo para mi'}</strong>
                          <span>{isShared ? 'Podras invitar miembros despues de crearla.' : 'Puedes invitar miembros mas tarde.'}</span>
                        </div>
                        {isShared && <Check size={16} />}
                      </button>
                   </div>
                </div>

                <div className="actions-footer">
                  <button className="secondary-btn-premium" onClick={() => setStep('design')}>
                    <ArrowLeft size={20} /> Back
                  </button>
                  <button 
                    className="primary-btn-premium" 
                    disabled={!title.trim() || !description.trim()} 
                    onClick={() => setStep(selectedType === 'opencap' ? 'review' : 'timing')}
                    style={{'--accent': typeInfo?.accent || 'var(--primary)'} as any}
                  >
                    Continue <ChevronRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'timing' && (
              <motion.div 
                key="timing"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="step-view"
              >
                <div className="step-header">
                  <span className="step-tag" style={{background: typeInfo?.accent+'20', color: typeInfo?.accent}}>Step 4</span>
                  <h3>Tiempo</h3>
                  <p>Cuando quieres que se abra?</p>
                </div>

                <div className="timing-picker-premium">
                   <div className="timer-preview-web">
                      <Clock size={40} color={typeInfo?.accent} />
                      <div className="timer-val">{selectedPreset ? presets.find(p => p.days === selectedPreset)?.label : 'Personalizado'}</div>
                      <p>{opensAt ? new Date(opensAt).toLocaleDateString() : 'Fecha calculada automaticamente'}</p>
                   </div>

                   <div className="preset-grid-web">
                     {presets.map(preset => (
                       <button
                         key={preset.days}
                         className={selectedPreset === preset.days && !opensAt ? 'active' : ''}
                         onClick={() => {
                           setSelectedPreset(preset.days);
                           setOpensAt('');
                         }}
                         style={{'--accent': typeInfo?.accent || 'var(--primary)'} as any}
                       >
                         <Clock size={16} />
                         <span>{preset.label}</span>
                       </button>
                     ))}
                   </div>
                   
                   <div className="input-group-premium">
                      <label>Fecha personalizada</label>
                      <input 
                        type="datetime-local" 
                        value={opensAt}
                        onChange={e => {
                          setOpensAt(e.target.value);
                          setSelectedPreset(null);
                        }}
                      />
                   </div>
                </div>

                <div className="actions-footer">
                  <button className="secondary-btn-premium" onClick={() => setStep('identity')}>
                    <ArrowLeft size={20} /> Back
                  </button>
                  <button 
                    className="primary-btn-premium" 
                    onClick={() => setStep('review')}
                    style={{'--accent': typeInfo?.accent || 'var(--primary)'} as any}
                  >
                    Set Time <ChevronRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'review' && (
              <motion.div 
                key="review"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="step-view"
              >
                <div className="step-header">
                  <span className="step-tag" style={{background: typeInfo?.accent+'20', color: typeInfo?.accent}}>Final Step</span>
                  <h3>Revision</h3>
                  <p>Comprueba que todo esta listo.</p>
                </div>

                <div className="review-card-premium" style={{'--accent': typeInfo?.accent} as any}>
                   <div className="review-model">
                      <img src={getModelImage(model)} alt="" />
                   </div>
                   <div className="review-details">
                      <h4>{title}</h4>
                      <div className="review-meta-item">
                         <Layers size={14} /> <span>{selectedType === 'opencap' ? 'Capsula abierta' : 'Capsula cerrada'}</span>
                      </div>
                      {selectedType !== 'opencap' && (
                        <div className="review-meta-item">
                           <Clock size={14} /> <span>Abre {opensAt ? new Date(opensAt).toLocaleDateString() : `en ${selectedPreset || 7} dias`}</span>
                        </div>
                      )}
                      <div className="review-meta-item">
                         {isPublic ? <Globe size={14} /> : <Lock size={14} />}
                         <span>{isPublic ? 'Public' : 'Private'}</span>
                      </div>
                      <div className="review-meta-item">
                         {isShared ? <Users size={14} /> : <BookOpen size={14} />}
                         <span>{isShared ? 'Compartida' : 'Individual'}</span>
                      </div>
                   </div>
                </div>

                {error && <div className="error-banner">{error}</div>}

                <div className="actions-footer">
                  <button className="secondary-btn-premium" onClick={() => setStep(selectedType === 'opencap' ? 'identity' : 'timing')}>
                    <ArrowLeft size={20} /> Back
                  </button>
                  <button 
                    className="primary-btn-premium launch-btn" 
                    disabled={loading} 
                    onClick={handleCreate}
                    style={{'--accent': typeInfo?.accent || 'var(--primary)'} as any}
                  >
                    {loading ? 'Creando...' : selectedType === 'opencap' ? 'Crear capsula' : 'Sellar capsula'} <Sparkles size={20} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <style>{`
          .create-capsule-modal {
            max-width: 920px;
            width: 95%;
            height: min(860px, 92vh);
            display: flex;
            flex-direction: column;
            padding: 0 !important;
            overflow: hidden;
            border-radius: 32px;
            box-shadow: 0 30px 60px rgba(0,0,0,0.2);
          }
          
          .modal-header-premium {
            padding: 30px 40px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: linear-gradient(to bottom, rgba(255,255,255,0.5), transparent);
            border-bottom: 1px solid var(--border);
          }

          .header-left { display: flex; align-items: center; gap: 20px; }
          .back-btn-circle {
            width: 44px; height: 44px; border-radius: 50%;
            background: white; border: 1.5px solid var(--border);
            display: flex; align-items: center; justify-content: center;
            color: var(--text-sec);
          }
          .header-left h2 { margin: 0; font-size: 24px; font-weight: 800; }
          .header-left p { margin: 0; font-size: 13px; color: var(--text-muted); font-weight: 600; }

          .step-pills { display: flex; gap: 8px; }
          .step-pill { width: 8px; height: 8px; border-radius: 50%; background: var(--border); transition: all 0.3s; }
          .step-pill.active { background: var(--accent); width: 24px; border-radius: 4px; box-shadow: 0 0 10px var(--accent); }

          .create-scroll-area { flex: 1; overflow-y: auto; padding: 0 46px 42px; }
          .step-view { display: flex; flex-direction: column; min-height: 100%; padding-top: 30px; }
          
          .step-header { margin: 30px 0; }
          .step-tag {
            display: inline-block; padding: 4px 12px; border-radius: 8px;
            background: var(--primary-light); color: var(--primary);
            font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 10px;
          }
          .step-header h3 { font-size: 28px; margin: 0 0 8px 0; font-weight: 900; }
          .step-header p { color: var(--text-sec); margin: 0; font-size: 15px; }

          .type-list-premium { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
          .type-option-card {
            display: flex; align-items: center; gap: 18px; padding: 20px;
            border-radius: 20px; border: 2.5px solid var(--border);
            text-align: left; transition: all 0.3s; cursor: pointer;
            background: white;
          }
          .type-option-card:hover { transform: translateY(-3px); border-color: var(--accent); }
          .type-option-card.active { background: var(--bg-light); border-color: var(--accent); box-shadow: 0 10px 20px rgba(0,0,0,0.05); }
          
          .type-option-icon { font-size: 32px; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; background: white; border-radius: 16px; border: 1px solid var(--border); }
          .type-option-title { font-size: 18px; font-weight: 800; display: flex; align-items: center; gap: 10px; }
          .check-icon { color: var(--accent); }
          .type-option-content p { margin: 4px 0 8px; font-size: 13px; color: var(--text-sec); line-height: 1.4; }
          .type-option-meta { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: var(--text-muted); }

          .model-selection-area { display: grid; grid-template-columns: minmax(380px, 1fr) 260px; gap: 24px; align-items: start; }
          .model-carousel-panel {
            min-height: 420px;
            position: relative;
            border-radius: 30px;
            overflow: hidden;
            border: 1px solid rgba(232,228,245,0.95);
            background: radial-gradient(circle at 50% 26%, color-mix(in srgb, var(--accent), transparent 80%), transparent 38%), linear-gradient(180deg, #fff, #f8f7ff);
            box-shadow: 0 18px 42px rgba(26,21,48,0.08);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .carousel-stage { position: relative; width: 100%; height: 292px; display: grid; place-items: center; overflow: hidden; }
          .carousel-capsule-wrap { position: absolute; width: 280px; height: 280px; display: grid; place-items: center; }
          .carousel-capsule-wrap img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 22px 34px rgba(15,11,30,0.18)); }
          .carousel-arrow {
            position: absolute;
            top: 42%;
            z-index: 5;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: rgba(255,255,255,0.92);
            border: 1px solid rgba(232,228,245,0.95);
            color: var(--accent);
            display: grid;
            place-items: center;
            box-shadow: 0 10px 24px rgba(26,21,48,0.12);
          }
          .carousel-arrow.left { left: 18px; }
          .carousel-arrow.right { right: 18px; }
          .carousel-model-copy { width: 100%; padding: 0 24px 24px; text-align: center; }
          .carousel-model-copy h4 { margin: 0; font-size: 24px; color: var(--text); }
          .carousel-model-copy p { margin: 4px auto 8px; max-width: 360px; color: var(--text-sec); font-size: 13px; font-weight: 700; }
          .carousel-model-copy span { color: var(--text-muted); font-size: 12px; font-weight: 900; }
          .model-side-panel { display: flex; flex-direction: column; gap: 12px; }
          .grid-toggle-btn { width: 100%; min-height: 48px; border-radius: 16px; background: #fff; border: 1.5px solid var(--border); display: inline-flex; align-items: center; justify-content: center; gap: 8px; color: var(--text-sec); font-weight: 900; }
          .model-grid-premium { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-height: 360px; overflow-y: auto; padding: 5px; scrollbar-width: thin; }
          .model-grid-premium::-webkit-scrollbar { display: none; }
          .model-item-sm {
            min-width: 64px; height: 72px; border-radius: 16px;
            border: 2px solid var(--border); padding: 8px; background: white;
          }
          .model-item-sm.active { border-color: var(--accent); background: var(--accent); opacity: 0.1; } /* Fallback for active state style */
          .model-item-sm.active { background: white; border-width: 3px; transform: scale(1.1); box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
          .model-item-sm img { width: 100%; height: 100%; object-fit: contain; }
          .shared-toggle-card { width: 100%; display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 18px; background: #fff; border: 2px solid var(--border); color: var(--text-sec); text-align: left; }
          .shared-toggle-card.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent), white 92%); color: var(--accent); }
          .shared-toggle-card div { flex: 1; display: flex; flex-direction: column; gap: 2px; }
          .shared-toggle-card strong { color: var(--text); font-size: 14px; }
          .shared-toggle-card span { font-size: 12px; font-weight: 700; color: var(--text-muted); }

          .form-premium { display: flex; flex-direction: column; gap: 24px; }
          .input-group-premium label { display: block; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 10px; }
          .input-group-premium input, .input-group-premium textarea {
            width: 100%; padding: 18px 24px; border-radius: 18px; border: 2px solid var(--border);
            background: var(--surface-alt); font-size: 16px; font-weight: 600; outline: none; transition: all 0.2s;
          }
          .input-group-premium input:focus, .input-group-premium textarea:focus { border-color: var(--primary); background: white; box-shadow: 0 0 0 4px var(--primary-light); }

          .visibility-toggle-premium { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .visibility-toggle-premium button {
            display: flex; align-items: center; justify-content: center; gap: 10px;
            padding: 16px; border-radius: 16px; border: 2px solid var(--border); background: white;
            font-weight: 700; color: var(--text-sec);
          }
          .visibility-toggle-premium button.active { background: var(--text); color: white; border-color: var(--text); }
          .hint-text { margin-top: 10px; font-size: 12px; color: var(--text-muted); line-height: 1.4; }

          .timer-preview-web {
            background: var(--surface-alt); padding: 30px; border-radius: 24px;
            display: flex; flex-direction: column; align-items: center; margin-bottom: 30px;
          }
          .timer-val { font-size: 42px; font-weight: 900; color: var(--text); margin: 10px 0 2px; }
          .timer-preview-web p { margin: 0; color: var(--text-muted); font-weight: 600; }
          .preset-grid-web { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 22px; }
          .preset-grid-web button { min-height: 76px; border-radius: 18px; background: #fff; border: 2px solid var(--border); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-sec); font-weight: 900; }
          .preset-grid-web button.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent), white 92%); }

          .review-card-premium {
            display: flex; align-items: center; gap: 30px; padding: 30px;
            background: white; border-radius: 24px; border: 2px solid var(--accent);
            box-shadow: 0 15px 30px rgba(0,0,0,0.05);
          }
          .review-model { width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; background: var(--background); border-radius: 20px; }
          .review-model img { width: 90px; height: 90px; object-fit: contain; }
          .review-details h4 { margin: 0 0 15px 0; font-size: 22px; font-weight: 900; }
          .review-meta-item { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; color: var(--text-sec); font-weight: 600; font-size: 14px; }
          
          .actions-footer { display: flex; gap: 15px; margin-top: auto; padding-top: 40px; }
          .primary-btn-premium {
            flex: 2; padding: 18px; border-radius: 18px; background: var(--accent); color: white;
            font-size: 17px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 10px;
            box-shadow: 0 10px 20px rgba(0,0,0,0.1);
          }
          .primary-btn-premium:disabled { opacity: 0.5; cursor: not-allowed; }
          .secondary-btn-premium {
            flex: 1; padding: 18px; border-radius: 18px; border: 2px solid var(--border);
            color: var(--text-sec); font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 10px;
          }
          .launch-btn { background: linear-gradient(135deg, var(--accent) 0%, var(--primary) 100%); }

          @media (max-width: 820px) {
            .create-capsule-modal { width: 100%; height: 100vh; border-radius: 0; }
            .modal-header-premium { padding: 22px 20px; }
            .create-scroll-area { padding: 0 18px 34px; }
            .type-list-premium { grid-template-columns: 1fr; }
            .model-selection-area { grid-template-columns: 1fr; }
            .model-carousel-panel { min-height: 360px; }
            .carousel-stage { height: 240px; }
            .carousel-capsule-wrap { width: 230px; height: 230px; }
            .model-side-panel { width: 100%; }
            .model-grid-premium { grid-template-columns: repeat(4, 1fr); max-height: 230px; }
            .preset-grid-web { grid-template-columns: repeat(2, 1fr); }
          }

          .seal-anim-overlay { position: fixed; inset: 0; z-index: 3000; background: #0D0A1A; display: flex; align-items: center; justify-content: center; }
          @media (max-width: 760px) {
            .create-capsule-modal { width: 100%; height: 100%; border-radius: 0; }
            .modal-header-premium { padding: 22px; }
            .create-scroll-area { padding: 0 22px 28px; }
            .type-list-premium, .model-selection-area { grid-template-columns: 1fr; }
          }
        `}</style>
      </motion.div>
    </motion.div>
  );
};

// ─── SealAnimation Component (Web version) ───────────────────────────────────
const SealAnimation = ({ accent, modelUri, modelOpenUri, onDone, isOpen }: any) => {
  const [stage, setStage] = useState<'filling' | 'sealed' | 'done'>('filling');

  useEffect(() => {
    const timer1 = setTimeout(() => setStage('sealed'), 2500);
    const timer2 = setTimeout(() => setStage('done'), 5000);
    const timer3 = setTimeout(onDone, 6500);
    return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
  }, []);

  return (
    <div className="seal-anim-container">
      <AnimatePresence>
        {stage === 'filling' && (
          <motion.div 
            key="filling"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            className="anim-content"
          >
             <div className="glow-orb" style={{'--accent': accent} as any} />
             <img src={isOpen ? modelUri : (modelOpenUri || modelUri)} className="anim-model" alt="" />
             <div className="filling-particles">
                {[1,2,3,4,5].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ y: [-100, -300], opacity: [0, 1, 0], scale: [0, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                    className="particle"
                    style={{'--accent': accent} as any}
                  />
                ))}
             </div>
             <p className="anim-text">{isOpen ? 'Preparing Capsule...' : 'Sealing Memories...'}</p>
          </motion.div>
        )}

        {stage === 'sealed' && (
          <motion.div 
            key="sealed"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="anim-content"
          >
             <motion.div 
               animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
               transition={{ duration: 2, repeat: Infinity }}
               className="shockwave"
               style={{'--accent': accent} as any} 
             />
             <img src={modelUri} className="anim-model" alt="" />
             {!isOpen && (
               <motion.div 
                 initial={{ scale: 0, rotate: -45 }}
                 animate={{ scale: 1, rotate: 0 }}
                 className="lock-badge"
                 style={{background: accent}}
               >
                 <Lock size={32} color="#fff" />
               </motion.div>
             )}
          </motion.div>
        )}

        {stage === 'done' && (
          <motion.div 
            key="done"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="anim-content"
          >
             <div className="success-icon" style={{background: accent}}><Check size={40} /></div>
             <h2 className="success-title">Successfully Launched</h2>
             <p className="success-desc">{isOpen ? 'Your story is now live!' : 'Your memories are sealed and waiting.'}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .seal-anim-container { color: white; text-align: center; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        .anim-content { display: flex; flex-direction: column; align-items: center; gap: 30px; position: relative; }
        .anim-model { width: 280px; height: 280px; object-fit: contain; z-index: 2; filter: drop-shadow(0 0 30px var(--accent)); }
        .glow-orb { position: absolute; width: 400px; height: 400px; background: radial-gradient(circle, var(--accent) 0%, transparent 70%); opacity: 0.2; z-index: 1; }
        .filling-particles { position: absolute; bottom: 100px; width: 100px; height: 200px; }
        .particle { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); left: 50%; }
        .anim-text { font-size: 24px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); }
        .shockwave { position: absolute; width: 300px; height: 300px; border: 4px solid var(--accent); border-radius: 50%; z-index: 1; }
        .lock-badge { position: absolute; bottom: 20px; right: 20px; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 3; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .success-icon { width: 100px; height: 100px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 0 50px var(--accent); }
        .success-title { font-size: 36px; font-weight: 900; margin: 0; }
        .success-desc { font-size: 18px; opacity: 0.7; margin: 10px 0 0; }
      `}</style>
    </div>
  );
};
