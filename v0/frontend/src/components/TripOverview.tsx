import type { TripOverview as TripOverviewType } from '../types';

interface TripOverviewProps {
  overview: TripOverviewType;
}

export function TripOverview({ overview }: TripOverviewProps) {
  return (
    <div className="trip-overview">
      <h2>{overview.title}</h2>
      <p className="summary">{overview.summary}</p>

      {overview.themes && overview.themes.length > 0 && (
        <div className="themes">
          <h3>Themes</h3>
          <ul>
            {overview.themes.map((theme, idx) => (
              <li key={idx}>{theme}</li>
            ))}
          </ul>
        </div>
      )}

      {overview.topMoments && overview.topMoments.length > 0 && (
        <div className="top-moments">
          <h3>Top Moments</h3>
          <ul>
            {overview.topMoments.map((moment, idx) => (
              <li key={idx}>{moment}</li>
            ))}
          </ul>
        </div>
      )}

      {overview.destinations && overview.destinations.length > 0 && (
        <div className="destinations">
          <h3>Destinations</h3>
          {overview.destinations.map((dest, idx) => (
            <div key={idx} className="destination">
              <h4>{dest.name}</h4>
              {dest.highlights && dest.highlights.length > 0 && (
                <ul>
                  {dest.highlights.map((highlight, hIdx) => (
                    <li key={hIdx}>{highlight}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {overview.travelStyle && (
        <div className="travel-style">
          <h3>Travel Style</h3>
          <p>{overview.travelStyle}</p>
        </div>
      )}
    </div>
  );
}

