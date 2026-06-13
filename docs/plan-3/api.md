#### GET `/locks`
Get current lock state for all accessible profiles.

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "profileId": "prof-abc-123",
      "lockedBy": "user-1",
      "lockedByName": "Alice",
      "deviceId": "device-laptop-alice",
      "lockedAt": "2026-06-10T14:00:00Z",
      "expiresAt": "2026-06-10T15:00:00Z",
      "status": "locked"
    }
  ]
}
```


#### POST `/profile-lock`

**Response (200):**
```json
{
  "data": [
    {
      "profileId": "prof-abc-123",
      "lockedBy": "user-1",
      "lockedByName": "Alice",
      "deviceId": "device-laptop-alice",
    }
  ]
}
```


#### DELETE `/release-profile-lock`

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
    }
  ]
}
```


#### GET `/get-profile-status`

**Response (200):**
```json
{
  "data": [
    {
      "id": 1, "locked" : "true", expires_at: ""
    }
  ]
}```




ketika profile sedang dibuka maka tiap 30 detik harus ada request ke backend, untuk menandakan bahwa aplikasi sedang menyala dan device sedang aktif, maka ada kolom expires at -> tiap 30 detik di refresh waktunya

#### UPDATE `/heartbeat-profile-lock`

**Response (200):**
```json
{
  "data": [
    {
      "id": 1
    }
  ]
}```