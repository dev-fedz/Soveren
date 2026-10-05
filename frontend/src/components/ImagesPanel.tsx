import React, { useState, useEffect, useRef } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Download,
  Image as ImageIcon,
  Layers,
  FileImage,
  Info,
} from 'lucide-react';
import type { AgentArtifact } from '../types/workspace';

interface ImagesPanelProps {
  activeImagePath?: string | null;
  screenshots?: AgentArtifact[];
  onSelectImage?: (path: string) => void;
}

export function ImagesPanel({
  activeImagePath,
  screenshots = [],
  onSelectImage,
}: ImagesPanelProps) {
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<'fit' | 'actual' | 'custom'>('fit');
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number } | null>(null);
  const [fileSize, setFileSize] = useState<string>('');
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImageError(false);
    setImgDimensions(null);
    setZoom(1);
    setFitMode('fit');
  }, [activeImagePath]);

  // Normalize image URL
  const imageUrl = activeImagePath
    ? (activeImagePath.startsWith('http') || activeImagePath.startsWith('/images/view') || activeImagePath.startsWith('/artifacts')
        ? activeImagePath
        : `http://localhost:5001/images/view?path=${encodeURIComponent(activeImagePath)}`)
    : screenshots.length > 0
    ? (screenshots[screenshots.length - 1].path?.startsWith('http')
        ? screenshots[screenshots.length - 1].path!
        : `http://localhost:5001/artifacts/${screenshots[screenshots.length - 1].id}/content`)
    : null;

  const currentFileName = activeImagePath
    ? activeImagePath.split('/').pop() || 'Image'
    : screenshots.length > 0
    ? screenshots[screenshots.length - 1].title
    : 'No Image';

  const ext = currentFileName.split('.').pop()?.toUpperCase() || 'PNG';

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setImageError(false);
  };

  const handleZoomIn = () => {
    setZoom((z) => Math.min(z + 0.25, 4));
    setFitMode('custom');
  };

  const handleZoomOut = () => {
    setZoom((z) => Math.max(z - 0.25, 0.25));
    setFitMode('custom');
  };

  const handleResetZoom = () => {
    setZoom(1);
    setFitMode('actual');
  };

  const handleFit = () => {
    setFitMode('fit');
    setZoom(1);
  };

  return (
    <div className="images-panel-container">
      {/* Top Toolbar */}
      <div className="images-toolbar">
        <div className="image-info-tag">
          <FileImage size={14} className="text-blue-400" />
          <span className="font-semibold">{currentFileName}</span>
          <span className="badge-format">{ext}</span>
          {imgDimensions && (
            <span className="text-xs text-zinc-400">
              {imgDimensions.width} × {imgDimensions.height} px
            </span>
          )}
        </div>

        <div className="image-controls">
          <button className="ctrl-btn" onClick={handleZoomOut} title="Zoom out">
            <ZoomOut size={13} />
          </button>
          <span className="zoom-percentage">{Math.round(zoom * 100)}%</span>
          <button className="ctrl-btn" onClick={handleZoomIn} title="Zoom in">
            <ZoomIn size={13} />
          </button>
          <button
            className={`ctrl-btn ${fitMode === 'actual' ? 'active' : ''}`}
            onClick={handleResetZoom}
            title="100% Actual size"
          >
            1:1
          </button>
          <button
            className={`ctrl-btn ${fitMode === 'fit' ? 'active' : ''}`}
            onClick={handleFit}
            title="Fit to window"
          >
            <Maximize2 size={13} /> Fit
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div className="images-stage" ref={containerRef}>
        {imageUrl ? (
          <div className="image-wrapper" style={{ transform: fitMode === 'custom' ? `scale(${zoom})` : undefined }}>
            <img
              src={imageUrl}
              alt={currentFileName}
              className={`stage-img ${fitMode === 'fit' ? 'fit-img' : ''}`}
              onLoad={handleImageLoad}
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <div className="images-empty-placeholder">
            <ImageIcon size={48} className="text-zinc-600 mb-3" />
            <h3 className="text-zinc-300 font-medium">No Image Selected</h3>
            <p className="text-zinc-500 text-sm max-w-sm text-center">
              Select an image from the project explorer or run a test to inspect automated failure screenshots.
            </p>
          </div>
        )}

        {imageError && (
          <div className="image-error-overlay">
            <Info size={18} className="text-red-400 mb-1" />
            <span>Unable to load image file preview.</span>
          </div>
        )}
      </div>

      {/* Recent Screenshots / Images Filmstrip */}
      {screenshots.length > 0 && (
        <div className="images-filmstrip">
          <div className="filmstrip-label">
            <Layers size={12} /> Recent Artifacts & Screenshots ({screenshots.length})
          </div>
          <div className="filmstrip-scroll">
            {screenshots.map((s) => {
              const sUrl = s.path?.startsWith('http')
                ? s.path
                : `http://localhost:5001/artifacts/${s.id}/content`;
              const isSelected = activeImagePath === s.path;
              return (
                <div
                  key={s.id}
                  className={`filmstrip-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectImage && onSelectImage(s.path || sUrl)}
                  title={s.title}
                >
                  <img src={sUrl} alt={s.title} className="thumb-img" />
                  <span className="thumb-title">{s.title.slice(0, 20)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
