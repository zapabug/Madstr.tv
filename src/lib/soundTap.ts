import { SILENT, createRhythm, readBands, type Bands } from './rhythm.ts';

// The lava lamp's ear (spec feat-lava-lamp LL2-1). It listens to the playing <audio> through captureStream(), which
// copies the sound out and leaves the element playing exactly as before (LL-R2): background play, the lock screen
// and the media keys never go through here. A file whose host does not allow reading (LL-R3) gives no sound to the
// copy, so the lamp hears silence and only drifts.

type Capturable = HTMLMediaElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };

export interface SoundTap {
  // The bands for this frame, given the seconds since the last one (all 0 when nothing can be heard).
  read(_seconds: number): Bands;
  close(): void;
}

export function createSoundTap(el: HTMLMediaElement | null): SoundTap {
  const AC = typeof window === 'undefined' ? undefined : window.AudioContext;
  const media = el as Capturable | null;
  if (!AC || !media || !(media.captureStream || media.mozCaptureStream)) return { read: () => SILENT, close: () => {} };
  const ac = new AC();
  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.55;
  const mute = ac.createGain(); // the analyser has to lead somewhere to be run; this way nothing is heard twice
  mute.gain.value = 0;
  analyser.connect(mute);
  mute.connect(ac.destination);
  const bins = new Uint8Array(analyser.frequencyBinCount);
  const rhythm = createRhythm();
  let source: MediaStreamAudioSourceNode | null = null;

  // A new item gives the element new tracks: capture again each time it starts playing.
  const capture = () => {
    source?.disconnect();
    source = null;
    try {
      const stream = media.captureStream ? media.captureStream() : media.mozCaptureStream!();
      if (stream.getAudioTracks().length === 0) return;
      source = ac.createMediaStreamSource(stream);
      source.connect(analyser);
      wake();
    } catch { /* another site's sound that may not be read: the lamp hears nothing */ }
  };
  const wake = () => { if (!document.hidden && ac.state === 'suspended') void ac.resume().catch(() => {}); };
  const onVisibility = () => { if (document.hidden) void ac.suspend().catch(() => {}); else wake(); };
  media.addEventListener('playing', capture);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('keydown', wake, true);
  window.addEventListener('pointerdown', wake, true);
  if (!media.paused) capture();
  wake();

  return {
    read(dt) {
      if (!source || media.paused || ac.state !== 'running') return SILENT;
      analyser.getByteFrequencyData(bins);
      return readBands(bins, dt, rhythm);
    },
    close() {
      media.removeEventListener('playing', capture);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', wake, true);
      window.removeEventListener('pointerdown', wake, true);
      source?.disconnect();
      void ac.close().catch(() => {});
    },
  };
}
