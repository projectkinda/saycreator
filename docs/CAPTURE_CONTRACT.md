# Capture contract (review draft)

Capture is deliberately separate from the video engine. A finished session is stored in IndexedDB as media chunks plus one manifest. References use `indexeddb://<session-id>/chunks`; an editor adapter can resolve that reference to a `Blob` without uploading it.

`CaptureManifest` is versioned and contains: `sessionId`, `source` (`"laptop"`; later sources may add `"phone"`), device labels/ids, actual resolution/fps, codec, duration, mic statistics, audio/video references, beats with all takes and one accepted take, and gaps between beats. Times are milliseconds from recording start. Audio-only captures omit `video.fileRef` and set `video.enabled` false.

The TypeScript definition in `src/capture/types.ts` is normative for version 1. The video engine is not changed by this contract. Before engine integration, Ragesh should confirm the URI resolver, whether accepted beat takes should be materialized as separate files, and where the project-store adapter writes the JSON beside media.
