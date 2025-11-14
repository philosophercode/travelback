import type { Photo } from '../types';
import { resolveMediaUrl } from '../api/client';

interface PhotoViewProps {
  photo: Photo;
}

export function PhotoView({ photo }: PhotoViewProps) {
  const imageUrl = resolveMediaUrl(photo.fileUrl);

  return (
    <div className="photo-view" id={`photo-${photo.id}`}>
      {imageUrl && (
        <div className="photo-image">
          <img src={imageUrl} alt={photo.filename} />
        </div>
      )}
      
      <div className="photo-info">
        <h4>{photo.filename}</h4>
        
        {photo.capturedAt && (
          <p className="captured-at">
            Captured: {new Date(photo.capturedAt).toLocaleString()}
          </p>
        )}

        {photo.locationCity && (
          <p className="location">
            📍 {[photo.locationNeighborhood, photo.locationCity, photo.locationCountry]
              .filter(Boolean)
              .join(', ')}
          </p>
        )}

        {photo.description && (
          <div className="description">
            <h5>Description</h5>
            <p><strong>Subject:</strong> {photo.description.mainSubject}</p>
            <p><strong>Setting:</strong> {photo.description.setting}</p>
            <p><strong>Mood:</strong> {photo.description.mood}</p>
            <p><strong>Time:</strong> {photo.description.timeOfDay}</p>
            <p><strong>Weather:</strong> {photo.description.weather}</p>
            
            {photo.description.activities && photo.description.activities.length > 0 && (
              <div>
                <strong>Activities:</strong>
                <ul>
                  {photo.description.activities.map((activity, idx) => (
                    <li key={idx}>{activity}</li>
                  ))}
                </ul>
              </div>
            )}

            {photo.description.notableDetails && photo.description.notableDetails.length > 0 && (
              <div>
                <strong>Notable Details:</strong>
                <ul>
                  {photo.description.notableDetails.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

