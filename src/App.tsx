import React, { useState, useRef } from 'react';
import './App.css';
import MapUploader from './components/MapUploader';
import ScaleCalibrator from './components/ScaleCalibrator';
import BoundaryDrawer from './components/BoundaryDrawer';
import RoadDrawer, { Road, Lot } from './components/RoadDrawer';
import LotGrid from './components/LotGrid';

export interface Constraints {
  lotAcres: number;
  roadFrontageFt: number;
  lotDepthFt: number; // auto-calculated
  roadWidthFt: number;
  scale: number;
}

type Step = 'upload' | 'calibrate' | 'boundary' | 'roads' | 'results';

const SQFT_PER_ACRE = 43560;

function calcDepth(acres: number, frontage: number): number {
  if (!frontage || frontage <= 0) return 0;
  return (acres * SQFT_PER_ACRE) / frontage;
}

function App() {
  const [step, setStep] = useState<Step>('upload');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [boundary, setBoundary] = useState<[number, number][] | null>(null);
  const [roads, setRoads] = useState<Road[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [constraints, setConstraints] = useState<Constraints>({
    lotAcres: 1.5,
    roadFrontageFt: 250,
    lotDepthFt: calcDepth(1.5, 250),
    roadWidthFt: 25,
    scale: 2,
  });
  const [scaleConfirmed, setScaleConfirmed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const updateConstraints = (patch: Partial<Constraints>) => {
    setConstraints(prev => {
      const next = { ...prev, ...patch };
      // Always recalculate depth from acres + frontage
      next.lotDepthFt = calcDepth(next.lotAcres, next.roadFrontageFt);
      return next;
    });
  };

  const roadWidthPx = constraints.roadWidthFt * constraints.scale;
  const lotDepthPx = constraints.lotDepthFt * constraints.scale;
  const lotWidthPx = constraints.roadFrontageFt * constraints.scale;
  const lotSizeSqFt = constraints.lotAcres * SQFT_PER_ACRE;

  const steps: Step[] = ['calibrate', 'boundary', 'roads', 'results'];
  const stepLabels = ['Set Scale', 'Boundary', 'Roads & Lots', 'Export'];
  const stepIndex = steps.indexOf(step);

  const handleScaleSet = (scale: number) => {
    setConstraints(c => ({ ...c, scale }));
    setScaleConfirmed(true);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Lot Layout Tool</h1>
        <p>Quick lot subdivision estimates</p>
      </header>

      {step !== 'upload' && (
        <div className="step-bar">
          {steps.map((s, i) => (
            <div key={s} className={"step-item" + (step === s ? ' active' : '') + (stepIndex > i ? ' done' : '')}>
              <span className="step-num">{i + 1}</span>
              <span className="step-label">{stepLabels[i]}</span>
            </div>
          ))}
        </div>
      )}

      <div className="app-container">
        {step === 'upload' && (
          <MapUploader onImageUpload={(img) => {
            setUploadedImage(img); setBoundary(null); setRoads([]); setLots([]);
            setScaleConfirmed(false); setStep('calibrate');
          }} />
        )}

        {step !== 'upload' && uploadedImage && (
          <div className="workspace">
            <div className="main-panel">
              {step === 'calibrate' && (
                <ScaleCalibrator imageData={uploadedImage} onScaleSet={handleScaleSet} canvasRef={canvasRef} />
              )}
              {step === 'boundary' && (
                <BoundaryDrawer imageData={uploadedImage} onBoundaryDraw={setBoundary} canvasRef={canvasRef} />
              )}
              {(step === 'roads' || step === 'results') && (
                <RoadDrawer
                  imageData={uploadedImage}
                  boundary={boundary}
                  roadWidthPx={roadWidthPx}
                  lotDepthPx={lotDepthPx}
                  lotWidthPx={lotWidthPx}
                  onRoadsChange={(r, l) => { setRoads(r); setLots(l); }}
                  canvasRef={canvasRef}
                />
              )}
            </div>

            <div className="control-panel">
              {/* Calibrate */}
              {step === 'calibrate' && (
                <div className="panel-card">
                  <h3>Why do this?</h3>
                  <p style={{ color: '#666', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1rem' }}>
                    Every Google Maps screenshot is a different scale. This tells the app the real size of things so lots are accurate.
                  </p>
                  <div className="info-box-simple">
                    <strong>How to find a known distance:</strong>
                    <ol style={{ marginTop: '0.5rem', paddingLeft: '1.2rem', lineHeight: 2 }}>
                      <li>Open Google Maps</li>
                      <li>Right-click two points → <em>Measure distance</em></li>
                      <li>Note the distance in feet</li>
                      <li>Tap those same two points on your uploaded map</li>
                    </ol>
                  </div>
                  <button className="btn-primary full-width" style={{ marginTop: '1rem' }}
                    disabled={!scaleConfirmed} onClick={() => setStep('boundary')}>
                    Next: Draw Boundary →
                  </button>
                  {!scaleConfirmed && <p className="hint-text">Set the scale on the map first</p>}
                  <button className="btn-secondary full-width" style={{ marginTop: '0.5rem' }}
                    onClick={() => { setScaleConfirmed(true); setStep('boundary'); }}>
                    Skip — use default scale
                  </button>
                </div>
              )}

              {/* Boundary */}
              {step === 'boundary' && (
                <div className="panel-card">
                  <h3>Step 2: Boundary</h3>
                  <p style={{ color: '#666', fontSize: '0.9rem', margin: '0.5rem 0 1rem' }}>
                    Tap around the edges of the property to outline it.
                  </p>
                  <button className="btn-primary full-width"
                    disabled={!boundary || boundary.length < 3} onClick={() => setStep('roads')}>
                    Next: Draw Roads →
                  </button>
                  {(!boundary || boundary.length < 3) && <p className="hint-text">Complete your boundary first</p>}
                </div>
              )}

              {/* Roads + Constraints */}
              {(step === 'roads' || step === 'results') && (
                <div className="panel-card">
                  <h3>Lot Parameters</h3>

                  {/* Primary inputs */}
                  <div className="form-group">
                    <label>Lot Size (acres)
                      <input type="number" value={constraints.lotAcres}
                        onChange={e => updateConstraints({ lotAcres: +e.target.value })}
                        min="0.1" step="0.25" />
                    </label>
                    <p className="help-text">{Math.round(lotSizeSqFt).toLocaleString()} sq ft per lot</p>
                  </div>

                  <div className="form-group">
                    <label>Road Frontage (ft)
                      <input type="number" value={constraints.roadFrontageFt}
                        onChange={e => updateConstraints({ roadFrontageFt: +e.target.value })}
                        min="20" step="10" />
                    </label>
                    <p className="help-text">Width of each lot along the road</p>
                  </div>

                  {/* Auto-calculated depth */}
                  <div className="auto-calc-box">
                    <span className="auto-label">Auto-calculated lot depth</span>
                    <span className="auto-value">{Math.round(constraints.lotDepthFt)} ft</span>
                    <span className="auto-sub">({constraints.lotAcres} acres ÷ {constraints.roadFrontageFt}ft frontage)</span>
                  </div>

                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label>Road Width (ft)
                      <input type="number" value={constraints.roadWidthFt}
                        onChange={e => updateConstraints({ roadWidthFt: +e.target.value })}
                        min="10" step="5" />
                    </label>
                  </div>

                  {/* Live stats */}
                  <div className="stat-row">
                    <div className="stat-chip">
                      <span className="stat-val">{constraints.lotAcres}</span>
                      <span className="stat-lbl">acres/lot</span>
                    </div>
                    <div className="stat-chip">
                      <span className="stat-val">{lots.length}</span>
                      <span className="stat-lbl">lots</span>
                    </div>
                    <div className="stat-chip">
                      <span className="stat-val">{lots.length > 0 ? (lots.length * constraints.lotAcres).toFixed(1) : '—'}</span>
                      <span className="stat-lbl">total ac</span>
                    </div>
                  </div>

                  {/* Presets */}
                  <div className="preset-row">
                    <p className="preset-label">Quick Presets:</p>
                    <div className="preset-buttons">
                      <button className="preset-btn" onClick={() => updateConstraints({ lotAcres: 0.25, roadFrontageFt: 75, roadWidthFt: 25 })}>
                        Residential<br/><small>¼ ac / 75ft</small>
                      </button>
                      <button className="preset-btn" onClick={() => updateConstraints({ lotAcres: 0.07, roadFrontageFt: 30, roadWidthFt: 20 })}>
                        RV Park<br/><small>3k sqft / 30ft</small>
                      </button>
                      <button className="preset-btn" onClick={() => updateConstraints({ lotAcres: 1.5, roadFrontageFt: 250, roadWidthFt: 30 })}>
                        Rural<br/><small>1.5 ac / 250ft</small>
                      </button>
                    </div>
                  </div>

                  {step === 'roads' && (
                    <button className="btn-primary full-width" style={{ marginTop: '1rem' }}
                      disabled={lots.length === 0} onClick={() => setStep('results')}>
                      Next: Export →
                    </button>
                  )}
                </div>
              )}

              {step === 'results' && (
                <LotGrid
                  lotCount={lots.length}
                  roadCount={roads.length}
                  lotSizeSqFt={lotSizeSqFt}
                  lotAcres={constraints.lotAcres}
                  roadFrontageFt={constraints.roadFrontageFt}
                  lotDepthFt={Math.round(constraints.lotDepthFt)}
                  roadWidthFt={constraints.roadWidthFt}
                  totalAcres={lots.length * constraints.lotAcres}
                  canvasRef={canvasRef}
                />
              )}

              <button className="btn-secondary full-width back-btn" onClick={() => {
                if (step === 'calibrate') { setStep('upload'); setUploadedImage(null); }
                if (step === 'boundary') setStep('calibrate');
                if (step === 'roads') setStep('boundary');
                if (step === 'results') setStep('roads');
              }}>← Back</button>
            </div>
          </div>
        )}
      </div>

      <footer className="app-footer">
        <p>⚠️ Rough estimates only. Always consult surveyors and engineers before proceeding.</p>
      </footer>
    </div>
  );
}

export default App;
