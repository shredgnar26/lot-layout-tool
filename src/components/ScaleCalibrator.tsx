import React, { useEffect, useState, useCallback } from 'react';

interface Props {
  imageData: string;
  onScaleSet: (scale: number) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const ScaleCalibrator: React.FC<Props> = ({ imageData, onScaleSet, canvasRef }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [realFeet, setRealFeet] = useState<string>('');
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = imageData;
  }, [imageData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);

    if (points.length >= 1) {
      // Draw the line
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      if (points.length === 2) {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        ctx.lineTo(points[1][0], points[1][1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Draw endpoint dots
      points.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? '#00e5ff' : '#ff4444';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(i === 0 ? 'A' : 'B', p[0] - 5, p[1] + 5);
      });

      // Show pixel distance
      if (points.length === 2) {
        const px = Math.sqrt((points[1][0] - points[0][0]) ** 2 + (points[1][1] - points[0][1]) ** 2);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(10, canvas.height - 60, 280, 50);
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`Line length: ${Math.round(px)} pixels`, 20, canvas.height - 32);
      }
    }

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(10, 10, 420, 72);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(
      points.length === 0 ? 'Tap point A (start of known distance)' :
      points.length === 1 ? 'Tap point B (end of known distance)' :
      '✓ Line set — enter the real distance below',
      18, 40
    );
    ctx.font = '17px Arial';
    ctx.fillText(points.length === 0 ? 'Pick two points you know the distance between' : `Points placed: ${points.length} / 2`, 18, 65);
  }, [image, points, canvasRef]);

  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.changedTouches[0];
      return [(t.clientX - rect.left) * sx, (t.clientY - rect.top) * sy];
    }
    return [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy];
  }, [canvasRef]);

  const handleTap = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (points.length >= 2) return;
    setPoints(prev => [...prev, getPos(e)]);
  }, [points, getPos]);

  const handleCalculate = () => {
    if (points.length < 2 || !realFeet) return;
    const px = Math.sqrt((points[1][0] - points[0][0]) ** 2 + (points[1][1] - points[0][1]) ** 2);
    const ft = parseFloat(realFeet);
    if (ft <= 0) return;
    const calculatedScale = px / ft;
    setScale(calculatedScale);
    onScaleSet(calculatedScale);
  };

  const handleReset = () => {
    setPoints([]);
    setRealFeet('');
    setScale(null);
  };

  const pixelDist = points.length === 2
    ? Math.sqrt((points[1][0] - points[0][0]) ** 2 + (points[1][1] - points[0][1]) ** 2)
    : 0;

  return (
    <div className="boundary-drawer">
      <div className="drawer-controls">
        <h3>Step 1: Set the Map Scale</h3>
        <p>This tells the app how big the lots should really be on your map.</p>

        <div className="calibration-steps">
          <div className={`cal-step ${points.length >= 1 ? 'done' : 'active'}`}>
            <span className="cal-num">1</span>
            <span>Tap point <strong>A</strong> on the map — pick a corner or landmark you recognize</span>
          </div>
          <div className={`cal-step ${points.length >= 2 ? 'done' : points.length === 1 ? 'active' : ''}`}>
            <span className="cal-num">2</span>
            <span>Tap point <strong>B</strong> — the other end of something you know the length of</span>
          </div>
          <div className={`cal-step ${scale ? 'done' : points.length === 2 ? 'active' : ''}`}>
            <span className="cal-num">3</span>
            <span>Type the real distance in feet between A and B, then tap <strong>Set Scale</strong></span>
          </div>
        </div>

        <div className="cal-tip">
          <strong>💡 Good examples to measure:</strong> a road you know is 500 ft long, a standard city block (~400 ft), or check Google Maps "Measure distance" for the exact number.
        </div>

        {points.length === 2 && (
          <div className="cal-input-row">
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>Distance from A to B (in feet)
                <input
                  type="number"
                  value={realFeet}
                  onChange={e => setRealFeet(e.target.value)}
                  placeholder="e.g. 500"
                  min="1"
                />
              </label>
            </div>
            <button className="btn-primary" onClick={handleCalculate} disabled={!realFeet} style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }}>
              Set Scale
            </button>
          </div>
        )}

        {scale && (
          <div className="status-message success">
            ✓ Scale set: {scale.toFixed(2)} px/ft — lots will now show at the correct size!
          </div>
        )}

        <div className="control-buttons" style={{ marginTop: '0.75rem' }}>
          <button onClick={handleReset} className="btn-secondary">🔄 Reset</button>
        </div>
      </div>

      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          onClick={handleTap}
          onTouchEnd={handleTap}
          style={{ cursor: points.length < 2 ? 'crosshair' : 'default', touchAction: 'none' }}
        />
      </div>

      {points.length === 2 && pixelDist > 0 && (
        <div className="info-row">
          <span>📏 Line length on screen: <strong>{Math.round(pixelDist)} px</strong></span>
          {realFeet && <span>→ Scale: <strong>{(pixelDist / parseFloat(realFeet)).toFixed(2)} px/ft</strong></span>}
        </div>
      )}
    </div>
  );
};

export default ScaleCalibrator;
