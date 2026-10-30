export function bestMimeType(cameraOn: boolean) {
  const candidates = cameraOn
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export async function requestMedia(cameraId: string | undefined, microphoneId: string | undefined, cameraOn: boolean) {
  const constraints = (useRememberedDevices: boolean): MediaStreamConstraints => ({
    audio: microphoneId && useRememberedDevices ? { deviceId: { exact: microphoneId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
    video: cameraOn ? {
      deviceId: cameraId && useRememberedDevices ? { exact: cameraId } : undefined,
      width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 },
    } : false,
  });

  try {
    return await navigator.mediaDevices.getUserMedia(constraints(true));
  } catch (cause) {
    const staleDevice = cause instanceof DOMException && (cause.name === 'OverconstrainedError' || cause.name === 'NotFoundError');
    if (!staleDevice || (!cameraId && !microphoneId)) throw cause;
    return navigator.mediaDevices.getUserMedia(constraints(false));
  }
}

export function stopStream(stream?: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function sampleBrightness(video: HTMLVideoElement): number | undefined {
  if (!video.videoWidth || !video.videoHeight) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 18;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(video, 0, 0, 32, 18);
  const data = ctx.getImageData(0, 0, 32, 18).data;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) total += (data[i] + data[i + 1] + data[i + 2]) / 3;
  return total / (data.length / 4) / 255;
}
