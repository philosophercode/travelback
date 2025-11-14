# Test Fixtures

This directory contains exported trip data from the database for use in tests.

## Generating Fixtures

After processing a trip, export it to fixtures:

```bash
# Run from v0/backend directory
./export-trip.sh <trip-id> ./test/fixtures

# Example:
./export-trip.sh da661f7d-29c8-4121-8cd6-2783851e9a5b
```

## File Structure

For each exported trip, you'll get:

```
test/fixtures/
├── trip-{id}.json              # Full trip response from API
├── trip-{id}-complete.json     # Combined fixture (recommended for tests)
└── days/
    ├── day-1.json
    ├── day-2.json
    └── ...
```

## Using Fixtures in Tests

### TypeScript/Vitest

```typescript
import tripFixture from './fixtures/trip-dc681854-complete.json';

describe('Trip Processing', () => {
  it('should have correct structure', () => {
    expect(tripFixture.trip.id).toBeDefined();
    expect(tripFixture.days).toHaveLength(2);
    expect(tripFixture.trip.overview.title).toBeTruthy();
  });

  it('should match expected photo count', () => {
    expect(tripFixture.trip.photos).toHaveLength(5);
  });
});
```

### Snapshot Testing

```typescript
describe('Trip Overview Format', () => {
  it('matches snapshot', () => {
    const overview = tripFixture.trip.overview;
    expect(overview).toMatchSnapshot();
  });
});
```

## Fixture Contents

Each fixture contains:

### Trip Data
- `id`: Trip UUID
- `name`: Trip name
- `startDate`, `endDate`: Trip date range
- `processing_status`: Processing state
- `overview`: AI-generated trip overview
  - `title`: Trip title
  - `narrative`: Trip story
  - `destinations`: Key destinations
  - `highlights`: Trip highlights
- `photos`: Array of processed photos with descriptions and locations
- `days`: Array of day summaries

### Day Data
- `dayNumber`: Day sequence number
- `date`: Day date
- `summary`: AI-generated day summary
  - `title`: Day title
  - `narrative`: Day story
  - `highlights`: Key highlights
  - `locations`: Visited locations
  - `activities`: Activities performed
  - `startTime`, `endTime`: Day timeframe
  - `totalDistance`: Distance traveled (km)
- `photos`: Photos from this day

## Best Practices

1. **Export after successful processing**: Only export trips with `processing_status: 'completed'`
2. **Use combined fixture**: The `-complete.json` file has everything in one place
3. **Version control**: Consider committing fixtures for regression testing
4. **Update regularly**: Re-export when processing logic changes
5. **Anonymize if needed**: Remove sensitive data before committing

## Example Workflow

```bash
# 1. Process a trip
./test.sh

# 2. Note the trip ID from output
# Trip ID: dc681854-cc27-4ea0-be60-11daddb04ff5

# 3. Export it
./export-trip.sh dc681854-cc27-4ea0-be60-11daddb04ff5

# 4. Use in tests
# The fixture is now available at:
# test/fixtures/trip-dc681854-cc27-4084-944e-d4af3d5398c7-complete.json
```

## Testing Scenarios

Use fixtures to test:

- ✅ Response structure validation
- ✅ Data type checking
- ✅ AI output quality
- ✅ Photo metadata extraction
- ✅ Location detection accuracy
- ✅ Day clustering logic
- ✅ Narrative generation
- ✅ API response formatting
- ✅ Snapshot/regression testing

