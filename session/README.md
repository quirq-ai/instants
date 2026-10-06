# Legacy session files

The active Instants store now has exactly two persistent data files for each private profile:

```text
.instants/
  <profile-uuid>/
    timeline.jsonl
    activity.jsonl
```

`timeline.jsonl` stores feed records and their source context. `activity.jsonl` stores private reading state, saves, notes, and supported local interactions. The local API selects the profile through the `HttpOnly` `instants-session` cookie.

This `session/` directory belongs to the earlier implementation, which used `<UUID>/session.json`. Existing journals remain untouched and ignored by Git; the new runtime does not write here or automatically migrate them. Preserve any legacy journal you still need. Its demo replies must not be interpreted as pending external sends.

On Vercel, the same two-log contract uses the `instants-timeline-v1` and `instants-activity-v1` localStorage keys. **Export timeline** and **Export activity** create separate manual backups. Keep an export before clearing site data.

Private browser identity is not authentication. People sharing a browser profile share its Instants data, and the local machine owner can inspect plaintext files. Never commit runtime logs or private exports.

See [the engine documentation](../docs/engine.md) for schemas, imports, storage modes and recovery behavior.
