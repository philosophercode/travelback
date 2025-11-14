import { useState, useRef, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { Trip } from '../types';
import './UploadPage.css';

interface UploadPageProps {
  onUploadSuccess: (trip: Trip) => void;
}

export function UploadPage({ onUploadSuccess }: UploadPageProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [tripName, setTripName] = useState('');
  const [useCustomName, setUseCustomName] = useState(false);
  const [enableNarration, setEnableNarration] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);

  // Create preview URLs for selected files
  useEffect(() => {
    // Revoke old URLs
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));

    // Create new URLs
    const urls = selectedFiles.map((file) => URL.createObjectURL(file));
    previewUrlsRef.current = urls;
    setPreviewUrls(urls);

    // Cleanup: revoke object URLs when component unmounts
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    setError(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    );
    setSelectedFiles(files);
    setError(null);
  };

  const handleAddMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    setSelectedFiles((prev) => [...prev, ...newFiles]);
    setError(null);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedFiles.length === 0) {
      setError('Please select at least one photo to upload');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const result = await apiClient.uploadTripWithPhotos(
        selectedFiles,
        useCustomName && tripName.trim() ? tripName.trim() : undefined,
        enableNarration
      );

      // Reset form
      setSelectedFiles([]);
      setTripName('');
      setUseCustomName(false);
      setEnableNarration(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Notify parent component
      onUploadSuccess(result.trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="upload-page">
      <div className="upload-container">
        <h2>Upload Trip Photos</h2>
        <p className="upload-description">
          Select photos from your trip. We'll automatically extract metadata and create a beautiful
          narrative for your journey.
        </p>

        <form onSubmit={handleSubmit} className="upload-form">
          {/* Trip Name Section */}
          <div className="trip-name-section">
            <label className="trip-name-toggle">
              <input
                type="checkbox"
                checked={useCustomName}
                onChange={(e) => setUseCustomName(e.target.checked)}
              />
              <span>Give this trip a custom name</span>
            </label>

            {useCustomName && (
              <input
                type="text"
                className="trip-name-input"
                placeholder="e.g., Summer Vacation 2024"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                maxLength={100}
              />
            )}

            {!useCustomName && (
              <p className="auto-name-hint">
                Trip name will be auto-generated based on the upload date
              </p>
            )}
          </div>

          {/* Narration Mode Section */}
          <div className="trip-name-section">
            <label className="trip-name-toggle">
              <input
                type="checkbox"
                checked={enableNarration}
                onChange={(e) => setEnableNarration(e.target.checked)}
              />
              <span>Enable interactive narration wizard (beta)</span>
            </label>
            {enableNarration && (
              <p className="auto-name-hint">
                After processing completes, you'll be guided through questions about each photo to create a personalized itinerary
              </p>
            )}
          </div>

          {/* File Upload Section */}
          <div
            className="file-drop-zone"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={selectedFiles.length === 0 ? handleFileSelect : handleAddMoreFiles}
              style={{ display: 'none' }}
            />

            {selectedFiles.length === 0 ? (
              <div className="drop-zone-content">
                <div className="drop-zone-icon">📸</div>
                <p className="drop-zone-text">
                  <strong>Click to select photos</strong> or drag and drop them here
                </p>
                <p className="drop-zone-hint">Supports JPEG, PNG, WebP, HEIC, and HEIF formats</p>
              </div>
            ) : (
              <div className="selected-files">
                <p className="selected-files-count">
                  {selectedFiles.length} photo{selectedFiles.length !== 1 ? 's' : ''} selected
                </p>
                <div className="thumbnail-grid">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="thumbnail-item">
                      <div className="thumbnail-image-wrapper">
                        <img
                          src={previewUrls[index]}
                          alt={file.name}
                          className="thumbnail-image"
                        />
                        <button
                          type="button"
                          className="thumbnail-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(index);
                          }}
                          aria-label={`Remove ${file.name}`}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M12 4L4 12M4 4l8 8"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                      <div className="thumbnail-info">
                        <span className="thumbnail-name" title={file.name}>
                          {file.name}
                        </span>
                        <span className="thumbnail-size">{formatFileSize(file.size)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="change-files-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Add More Photos
                </button>
              </div>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="upload-actions">
            <button
              type="submit"
              className="upload-button"
              disabled={uploading || selectedFiles.length === 0}
            >
              {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} Photo${selectedFiles.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

