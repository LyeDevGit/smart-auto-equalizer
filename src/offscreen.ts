import { type ExtensionMessage, type MessageResponse, type EQSettings, BAND_FREQUENCIES } from './types';

const FFT_SIZE = 2048;

// target eq offsets (roughly based on harman curve)
const TARGET_CURVE = [5, 6, 4, 1, -1, -2, -1, 0, 2, 3];

// fletcher-munson weighting so we don't overcorrect the mids
const PERCEPTUAL_WEIGHT = [0.5, 0.65, 0.8, 1.0, 1.0, 1.0, 0.9, 0.7, 0.5, 0.3];

// smoothing alphas for the filters (fast attack on bass, slow on highs)
const ATTACK_ALPHA = [0.3, 0.3, 0.35, 0.4, 0.45, 0.5, 0.5, 0.55, 0.55, 0.5];
const RELEASE_ALPHA = [0.04, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.1, 0.1];

// prevents adjacent bands from having massive volume differences
const CROSS_SMOOTH = 0.15;

// target -14 lufs since that's what most streaming platforms use now
const TARGET_LUFS = -14;

let audioCtx: AudioContext | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let filters: BiquadFilterNode[] = [];
let analyser: AnalyserNode | null = null;
let masterGain: GainNode | null = null;
let bypassNode: GainNode | null = null;
let lufsGain: GainNode | null = null;

let frequencyInterval: ReturnType<typeof setInterval> | null = null;
let autoEQActive = true;
let autoEQIntensity = 0.5;
let volumeLevel = 1.0;
let isBypass = false;
let loudnessNorm = true;

let currentBands: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
let inactiveFrames = 0;
let contentProfile = 0;
let contentSmoothed = 0;
let prevRegionAvgs: number[] | null = null;
let frameCount = 0;

let noiseFloorDb = -90;
let currentLufs = -24;
let peakDb = -90;
let rmsDb = -90;
let peakReduction = 0;

let limiter: DynamicsCompressorNode | null = null;

function createAudioPipeline(stream: MediaStream) {
  if (!audioCtx) audioCtx = new AudioContext({ latencyHint: 'interactive' });
  
  source = audioCtx.createMediaStreamSource(stream);
  
  bypassNode = audioCtx.createGain();
  bypassNode.gain.value = 1.0;
  
  masterGain = audioCtx.createGain();
  masterGain.gain.value = volumeLevel;
  
  lufsGain = audioCtx.createGain();
  lufsGain.gain.value = 1.0;

  limiter = audioCtx.createDynamicsCompressor();
  limiter.threshold.value = -0.5; // -0.5 dBFS ceiling (True Peak prevention)
  limiter.knee.value = 0.0; // Hard knee for brickwall
  limiter.ratio.value = 20.0; // Brickwall limiting
  limiter.attack.value = 0.002; // 2ms attack to catch transients
  limiter.release.value = 0.15; // Smooth release

  filters = [];
  let prevNode: AudioNode = bypassNode;
  for (let i = 0; i < 10; i++) {
    const filter = audioCtx.createBiquadFilter();
    
    // Pro EQ topology: Shelves on ends, Peaking in middle
    if (i === 0) {
      filter.type = 'lowshelf';
    } else if (i === 9) {
      filter.type = 'highshelf';
    } else {
      filter.type = 'peaking';
      filter.Q.value = Math.SQRT1_2; // Butterworth Q (0.707) for musical, flat summation
    }
    
    filter.frequency.value = BAND_FREQUENCIES[i];
    filter.gain.value = 0;
    filters.push(filter);
    prevNode.connect(filter);
    prevNode = filter;
  }
  
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0.85;
  
  // Pipeline: Source -> Bypass Switch -> (Filters or Direct) -> LUFS -> Master -> Limiter -> Analyser -> Dest
  source.connect(bypassNode);
  updateBypassRouting();
  
  lufsGain.connect(masterGain);
  masterGain.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(audioCtx.destination);
  
  startFrequencyBroadcast();
}

function updateBypassRouting() {
  if (!source || !bypassNode || !lufsGain) return;
  
  bypassNode.disconnect();
  const lastFilter = filters[filters.length - 1];
  if (lastFilter) lastFilter.disconnect();
  
  if (isBypass) {
    bypassNode.connect(lufsGain);
    filters.forEach(f => f.gain.setTargetAtTime(0, audioCtx!.currentTime, 0.1));
  } else {
    bypassNode.connect(filters[0]);
    lastFilter.connect(lufsGain);
  }
}

function destroyAudioPipeline() {
  stopFrequencyBroadcast();
  source?.disconnect();
  filters.forEach(f => f.disconnect());
  analyser?.disconnect();
  masterGain?.disconnect();
  bypassNode?.disconnect();
  lufsGain?.disconnect();
  limiter?.disconnect();
  source = null;
  filters = [];
  analyser = null;
  masterGain = null;
  bypassNode = null;
  lufsGain = null;
  limiter = null;
  if (audioCtx?.state !== 'closed') audioCtx?.close();
  audioCtx = null;
  prevRegionAvgs = null;
  frameCount = 0;
}

function byteToDb(value: number): number {
  return value === 0 ? -100 : 20 * Math.log10(value / 255);
}

function startFrequencyBroadcast() {
  stopFrequencyBroadcast();
  frequencyInterval = setInterval(() => {
    if (!analyser) return;
    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(data);

    const NUM_BANDS = 32;
    const downsampled: number[] = new Array(NUM_BANDS).fill(0);
    const counts: number[] = new Array(NUM_BANDS).fill(0);
    
    let maxVal = 0;
    let sumSq = 0;

    const sampleRate = audioCtx!.sampleRate || 48000;
    const nyquist = sampleRate / 2;
    const minLog = Math.log10(20);
    const maxLog = Math.log10(20000);
    
    for (let i = 0; i < bufferLength; i++) {
      const val = data[i] || 0;
      maxVal = Math.max(maxVal, val);
      sumSq += val * val;
      
      const freq = Math.max(20, i * (nyquist / bufferLength));
      if (freq > 20000) continue;
      
      const logFreq = Math.log10(freq);
      let bin = Math.floor(((logFreq - minLog) / (maxLog - minLog)) * NUM_BANDS);
      if (bin < 0) bin = 0;
      if (bin >= NUM_BANDS) bin = NUM_BANDS - 1;
      
      downsampled[bin] += val;
      counts[bin]++;
    }

    for (let i = 0; i < NUM_BANDS; i++) {
      if (counts[i] > 0) {
        downsampled[i] = Math.round(downsampled[i] / counts[i]);
      } else {
        downsampled[i] = i > 0 ? downsampled[i-1] : 0;
      }
    }
    
    // Calculate stats
    const rms = Math.sqrt(sumSq / data.length);
    peakDb = byteToDb(maxVal);
    rmsDb = byteToDb(rms);
    
    // Adaptive noise floor tracking
    if (rmsDb > -80) {
      if (rmsDb < noiseFloorDb + 10) noiseFloorDb = noiseFloorDb * 0.99 + rmsDb * 0.01;
    }
    
    // Basic LUFS approximation
    const approxLufs = rmsDb + 3; // K-weighting simplification
    currentLufs = currentLufs * 0.9 + approxLufs * 0.1;
    
    if (loudnessNorm && lufsGain && !isBypass && rmsDb > -60) {
      const diff = TARGET_LUFS - currentLufs;
      // Gentle compression/expansion
      const targetLufsGain = Math.max(-10, Math.min(6, diff * 0.5));
      const currentGain = 20 * Math.log10(lufsGain.gain.value);
      const newGain = currentGain + (targetLufsGain - currentGain) * 0.05;
      lufsGain.gain.setTargetAtTime(Math.pow(10, newGain / 20), audioCtx!.currentTime, 0.1);
      peakReduction = Math.min(0, newGain);
    } else if (lufsGain) {
      lufsGain.gain.setTargetAtTime(1.0, audioCtx!.currentTime, 0.2);
      peakReduction = 0;
    }

    chrome.runtime.sendMessage({
      type: 'FREQUENCY_DATA',
      payload: { 
        bands: downsampled, 
        contentType: contentProfile, 
        eqGains: [...currentBands],
        stats: { peakDb, rmsDb, lufs: currentLufs, peakReduction, noiseFloorDb }
      },
    });

    if (autoEQActive && !isBypass) {
      runAutoEQ(data);
    } else if (isBypass) {
      // Smoothly reset filters if bypassed
      for(let i=0; i<10; i++) {
        if(currentBands[i] !== 0) {
          currentBands[i] *= 0.9;
          if(Math.abs(currentBands[i]) < 0.1) currentBands[i] = 0;
          filters[i].gain.value = currentBands[i];
        }
      }
    }
    frameCount++;
  }, 50);
}

function stopFrequencyBroadcast() {
  if (frequencyInterval) {
    clearInterval(frequencyInterval);
    frequencyInterval = null;
  }
}

function computeRegionAverages(freqData: Uint8Array): number[] {
  const totalBins = freqData.length;
  const nyquist = audioCtx!.sampleRate / 2;
  const binWidth = nyquist / totalBins;
  const regions: number[] = [];
  let prevFreq = 0;
  for (let i = 0; i < 10; i++) {
    const targetFreq = BAND_FREQUENCIES[i];
    const startBin = Math.min(Math.floor(prevFreq / binWidth), totalBins - 1);
    const endBin = Math.min(Math.ceil(targetFreq / binWidth), totalBins - 1);
    let sum = 0;
    const count = Math.max(1, endBin - startBin);
    for (let b = startBin; b < endBin && b < totalBins; b++) sum += freqData[b];
    regions.push(sum / count);
    prevFreq = targetFreq;
  }
  return regions;
}

function classifyContent(regionAvgs: number[]): number {
  const totalEnergy = regionAvgs.reduce((a, b) => a + b, 0.001);
  let centroidWeighted = 0;
  for (let i = 0; i < regionAvgs.length; i++) centroidWeighted += i * regionAvgs[i];
  const centroid = centroidWeighted / totalEnergy;

  const speechEnergy = regionAvgs.slice(3, 7).reduce((a, b) => a + b, 0);
  const speechRatio = speechEnergy / totalEnergy;

  let variance = 1;
  if (prevRegionAvgs) {
    let sumSq = 0;
    for (let i = 0; i < regionAvgs.length; i++) sumSq += (regionAvgs[i] - prevRegionAvgs[i]) ** 2;
    variance = Math.sqrt(sumSq / regionAvgs.length);
  }

  const bassEnergy = regionAvgs.slice(0, 3).reduce((a, b) => a + b, 0);
  const bassRatio = bassEnergy / totalEnergy;

  const speechScore = centroid > 3.2 && centroid < 6.5 && speechRatio > 0.45 && variance > 12 && bassRatio < 0.3;
  const musicScore = (centroid < 4.5 || bassRatio > 0.25) && variance < 15;

  if (speechScore) return -1;
  if (musicScore) return 1;
  return 0;
}

function runAutoEQ(freqData: Uint8Array) {
  const regionAvgs = computeRegionAverages(freqData);

  const totalEnergy = regionAvgs.reduce((a, b) => a + b, 0);
  // Adaptive noise gate
  const threshold = Math.max(10, Math.pow(10, noiseFloorDb/20) * 255 * 1.5);
  
  if (totalEnergy < threshold) {
    inactiveFrames++;
    if (inactiveFrames > 12) {
      prevRegionAvgs = regionAvgs;
      return;
    }
  } else {
    inactiveFrames = 0;
  }

  if (frameCount % 20 === 0) {
    const score = classifyContent(regionAvgs);
    contentSmoothed = contentSmoothed + (score - contentSmoothed) * 0.15;
    contentProfile = Math.round(contentSmoothed);
  }

  const targetCurve = [...TARGET_CURVE];
  if (contentProfile < 0) {
    // Speech
    targetCurve[0] = 1; targetCurve[1] = 2; targetCurve[2] = 1; targetCurve[3] = 0; targetCurve[4] = 1;
    targetCurve[5] = 0; targetCurve[6] = 1; targetCurve[7] = 2; targetCurve[8] = 3; targetCurve[9] = 2;
  } else if (contentProfile > 0) {
    // Music
    targetCurve[0] = 6; targetCurve[1] = 7; targetCurve[2] = 5; targetCurve[3] = 1; targetCurve[4] = -1;
    targetCurve[5] = -2; targetCurve[6] = -1; targetCurve[7] = 1; targetCurve[8] = 3; targetCurve[9] = 4;
  }

  const globalAvg = regionAvgs.reduce((a, b) => a + b, 0) / regionAvgs.length;
  const targetLevels = targetCurve.map(offset => globalAvg * Math.pow(10, offset / 20));

  for (let i = 0; i < regionAvgs.length; i++) {
    const measured = regionAvgs[i];
    const weight = PERCEPTUAL_WEIGHT[i];
    const deviation = measured - targetLevels[i];
    
    // Dynamic Resonance Suppression (unmasking)
    const prev = i > 0 ? regionAvgs[i-1] : regionAvgs[i];
    const next = i < 9 ? regionAvgs[i+1] : regionAvgs[i];
    const localBg = (prev + next) / 2;
    // If the band is significantly louder than its neighbors, apply a penalty
    const resonancePenalty = measured > localBg * 1.5 ? (measured - localBg * 1.5) * 0.5 : 0;
    
    const targetGain = -Math.round(((deviation + resonancePenalty) / 128) * 12 * autoEQIntensity * weight);

    const current = currentBands[i];
    const alpha = targetGain < current ? ATTACK_ALPHA[i] : RELEASE_ALPHA[i];
    let smoothed = current + (targetGain - current) * alpha;

    if (i > 0) {
      smoothed = smoothed * (1 - CROSS_SMOOTH) + currentBands[i - 1] * CROSS_SMOOTH;
    }

    const clamped = Math.max(-12, Math.min(12, Math.round(smoothed)));
    if (clamped !== current) {
      currentBands[i] = clamped;
      filters[i].gain.value = clamped;
    }
  }

  prevRegionAvgs = regionAvgs;
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  const respond = (data?: MessageResponse) => { if (sendResponse) sendResponse(data); };
  switch (message.type) {
    case 'CAPTURE_START': {
      const { streamId } = message.payload;
      navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as any,
        video: false,
      })
      .then(stream => { createAudioPipeline(stream); respond({ success: true }); })
      .catch(err => respond({ success: false, error: String(err) }));
      return true;
    }
    case 'CAPTURE_STOP': {
      destroyAudioPipeline();
      respond({ success: true });
      return true;
    }
    case 'EQ_UPDATE': {
      const p = message.payload as Partial<EQSettings>;
      if (p.volume !== undefined) {
        volumeLevel = p.volume;
        if (masterGain) masterGain.gain.setTargetAtTime(p.volume, audioCtx!.currentTime, 0.05);
      }
      if (p.autoEQ !== undefined) autoEQActive = p.autoEQ;
      if (p.autoEQIntensity !== undefined) autoEQIntensity = p.autoEQIntensity;
      if (p.loudnessNorm !== undefined) loudnessNorm = p.loudnessNorm;
      if (p.bypass !== undefined) {
        isBypass = p.bypass;
        updateBypassRouting();
      }
      respond({ success: true });
      return true;
    }
  }
});

window.addEventListener('beforeunload', () => destroyAudioPipeline());

