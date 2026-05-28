import React, { useRef } from 'react';

interface Props { onImageUpload: (imageData: string) => void; }

const MapUploader: React.FC<Props> = ({ onImageUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onImageUpload(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="uploader-container">
      <div className="uploader-content">
        <h2>📍 Lot Layout Tool</h2>
        <p>Upload a satellite image or property map to get started. Draw roads and see how many lots fit.</p>
        <input ref={fileInputRef} type="file" onChange={handleFile} accept="image/*,application/pdf" style={{display:'none'}} />
        <button className="upload-button" onClick={() => fileInputRef.current?.click()}>📁 Upload Map</button>
        <div className="upload-tips">
          <h3>Tips</h3>
          <ul>
            <li>Screenshot from Google Maps works great</li>
            <li>Higher resolution = more accurate boundary</li>
            <li>PNG, JPG, or PDF accepted</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MapUploader;
