# Laptop capture

Open **Videos → Record** in current Chrome or Edge on `localhost` or HTTPS. Allow microphone access; camera access is optional. Pick devices, check the live light/mic/noise hints, paste or edit guided beats, then record. Space or **Done with this beat** advances. Pause, back, and retake are available. Media is written to IndexedDB every 1.5 seconds and an unfinished session is offered for recovery after reload.

Stopping creates one local file for the take. Review selects the accepted take per beat. Saving writes a versioned capture manifest beside the chunk reference. Nothing uploads in this step.

The editor receives the manifest described in `CAPTURE_CONTRACT.md`, with actual device settings, codec, duration, mic statistics, beats/takes, accepted choices, gaps, and local audio/video references.

Untested without real hardware: true 1080p/30 fallback behavior, device label/selection differences, long recordings and storage pressure, microphone calibration/background-noise accuracy, Safari/Firefox behavior, and crash recovery after an actual browser/process crash. Brightness and audio checks are simple heuristics, not delivery or face analysis.
