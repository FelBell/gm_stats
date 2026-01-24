# TTT Stats Backend

A Flask REST API to collect and serve statistics for GMod TTT.

## Configuration

Environment variables:

- `DATABASE_URL`: PostgreSQL connection string (e.g., `postgresql://user:pass@db:5432/dbname`).
- `API_KEY`: Secret key required for the `/api/collect` endpoint.

## Endpoints

### POST `/api/collect`

Receives round statistics.

**Headers:**
- `Content-Type: application/json`
- `X-Api-Key: <YOUR_API_KEY>`

**Payload:**

```json
{
  "server_id": "server_1",
  "map_name": "ttt_minecraft_b5",
  "winner": "traitors",
  "duration": 245,
  "kills": [
    {
      "attacker_steamid": "STEAM_0:1:12345",
      "attacker_role": "traitor",
      "victim_steamid": "STEAM_0:0:67890",
      "victim_role": "innocent",
      "weapon": "weapon_ttt_knife",
      "headshot": false
    }
  ]
}
```

### GET `/api/stats`

Retrieves recent rounds.

**Query Params:**
- `limit`: Number of rounds to return (default 20).
- `offset`: Pagination offset.

**Response:**
JSON array of round objects.
