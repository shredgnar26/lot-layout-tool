import React, { useEffect, useState, useCallback } from 'react';

interface Props {
  imageData: string;
  onBoundaryDraw: (boundary: [number, number][] | null) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const BoundaryDrawer: React.FC<Props> = ({ imageData, onBoundaryDraw, canvasRef }) => {
  const [points, setPoints] = useState<[number, number][]>([]);
  const [complete, setComplete] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

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

    if (points.length > 0) {
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      points.forEach(p => ctx.lineTo(p[0], p[1]));
      if (complete) ctx.closePath();
      ctx.stroke();

      if (complete) {
        ctx.fillStyle = 'rgba(255,68,68,0.1)';
        ctx.fill();
      }

      points.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? '#ff8800' : '#ff4444';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(10, 10, 360, 72);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(complete ? '✓ Boundary complete' : 'Tap to place boundary points', 18, 40);
    ctx.font = '18px Arial';
    ctx.fillText('Points: ' + points.length, 18, 66);
  }, [image, points, complete, canvasRef]);

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
    if (complete) return;
    setPoints(prev => [...prev, getPos(e)]);
  }, [complete, getPos]);

  const handleComplete = () => {
    if (points.length < 3) return;
    setComplete(true);
    onBoundaryDraw(points);
  };

  const handleReset = () => {
    setPoints([]);
    setComplete(false);
    onBoundaryDraw(null);
  };

  return (
    <div className="boundary-drawer">
      <div className="drawer-controls">
        <h3>Step 1: Draw Property Boundary</h3>
        <p>Tap around the property perimeter. Orange dot = first point.</p>
        <div className="control-buttons">
          <button onClick={handleComplete} disabled={points.length < 3 || complete} className="btn-primary">✓ Complete</button>
          <button onClick={() => { setPoints(p => p.slice(0,-1)); setComplete(false); onBoundaryDraw(null); }} disabled={points.length === 0} className="btn-secondary">↶ Undo</button>
          <button onClick={handleReset} className="btn-secondary">🔄 Reset</button>
        </div>
      </div>
      <div className="canvas-container">
        <canvas ref={canvasRef} onClick={handleTap} onTouchEnd={handleTap} style={{cursor:'crosshair', touchAction:'none'}} />
      </div>
      {complete && <div className="status-message success">✓ Boundary set! Tap "Next: Draw Roads →" above.</div>}
    </div>
  );
};

export default BoundaryDrawer;
