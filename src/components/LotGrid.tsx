import React, { useState } from 'react';
import jsPDF from 'jspdf';

interface Props {
  lotCount: number;
  roadCount: number;
  lotSizeSqFt: number;
  lotAcres: number;
  roadFrontageFt: number;
  lotDepthFt: number;
  roadWidthFt: number;
  totalAcres: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const LotGrid: React.FC<Props> = ({
  lotCount, roadCount, lotSizeSqFt, lotAcres, roadFrontageFt,
  lotDepthFt, roadWidthFt, totalAcres, canvasRef
}) => {
  const [title, setTitle] = useState('Lot Layout Analysis');
  const [notes, setNotes] = useState('');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const imgData = canvasRef.current.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: 'letter' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const m = 0.5;
      pdf.setFontSize(16);
      pdf.text(title || 'Lot Layout Analysis', m, m + 0.3);
      pdf.addImage(imgData, 'PNG', m, m + 0.55, pw - 2 * m, ph - 2.5);
      const y = ph - 1.6;
      pdf.setFontSize(10);
      pdf.setTextColor(60, 60, 60);
      [
        `Total Lots: ${lotCount}`,
        `Lot Size: ${lotAcres} acres (${Math.round(lotSizeSqFt).toLocaleString()} sq ft)`,
        `Road Frontage: ${roadFrontageFt} ft  |  Lot Depth: ${lotDepthFt} ft`,
        `Road Width: ${roadWidthFt} ft  |  Roads Drawn: ${roadCount}`,
        `Total Area (lots only): ${totalAcres.toFixed(2)} acres`,
        `Generated: ${new Date().toLocaleDateString()}`,
        notes ? `Notes: ${notes}` : '',
      ].filter(Boolean).forEach((l, i) => pdf.text(l, m, y + i * 0.2));
      pdf.save((title.replace(/\s+/g, '_') || 'lot_layout') + '_' + Date.now() + '.pdf');
    } catch { alert('Export failed. Try again.'); }
    setExporting(false);
  };

  return (
    <div className="lot-grid-results">
      <h3>Results & Export</h3>

      <div className="results-summary">
        <div className="result-card">
          <h4>Total Lots</h4>
          <p className="big-number">{lotCount}</p>
          <p className="label">lots</p>
        </div>
        <div className="result-card">
          <h4>Each Lot</h4>
          <p className="big-number">{lotAcres}</p>
          <p className="label">acres</p>
        </div>
        <div className="result-card">
          <h4>Total Area</h4>
          <p className="big-number">{totalAcres.toFixed(1)}</p>
          <p className="label">acres</p>
        </div>
      </div>

      <div className="lot-detail-box">
        <div className="lot-detail-row">
          <span>Frontage</span><strong>{roadFrontageFt} ft</strong>
        </div>
        <div className="lot-detail-row">
          <span>Depth</span><strong>{lotDepthFt} ft</strong>
        </div>
        <div className="lot-detail-row">
          <span>Sq Ft / Lot</span><strong>{Math.round(lotSizeSqFt).toLocaleString()}</strong>
        </div>
        <div className="lot-detail-row">
          <span>Road Width</span><strong>{roadWidthFt} ft</strong>
        </div>
        <div className="lot-detail-row">
          <span>Roads Drawn</span><strong>{roadCount}</strong>
        </div>
      </div>

      <div className="export-section">
        <h4>Export PDF</h4>
        <div className="form-group">
          <label>Title
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Main Street Parcel" />
          </label>
        </div>
        <div className="form-group">
          <label>Notes
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Assumptions, next steps..." rows={2} />
          </label>
        </div>
        <button className="btn-primary full-width" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting…' : '📄 Export as PDF'}
        </button>
      </div>

      <div className="disclaimer-box">
        <h4>⚠️ Disclaimer</h4>
        Rough estimate only. Does not account for topography, utilities, easements, setbacks, or local regulations.
      </div>
    </div>
  );
};

export default LotGrid;
