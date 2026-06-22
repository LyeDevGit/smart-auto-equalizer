export interface EQSettings {
  volume: number;
  autoEQ: boolean;
  autoEQIntensity: number;
  loudnessNorm: boolean;
  bypass: boolean;
}

export const DEFAULT_SETTINGS: EQSettings = {
  volume: 1.0,
  autoEQ: true,
  autoEQIntensity: 0.5,
  loudnessNorm: true,
  bypass: false,
};

export const BAND_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const BAND_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

export interface AudioStats {
  peakDb: number;
  rmsDb: number;
  lufs: number;
  peakReduction: number;
  noiseFloorDb: number;
}

export type ExtensionMessage = 
  | { type: 'GET_STATE' }
  | { type: 'TOGGLE_TAB', payload: { tabId: number, enabled: boolean } }
  | { type: 'EQ_UPDATE', payload: Partial<EQSettings> }
  | { type: 'CAPTURE_START', payload: { streamId: string } }
  | { type: 'CAPTURE_STOP' }
  | { 
      type: 'FREQUENCY_DATA', 
      payload: { 
        bands: number[], 
        contentType?: number, 
        eqGains?: number[], 
        stats?: AudioStats 
      } 
    };

export interface MessageResponse {
  success?: boolean;
  active?: boolean;
  tabId?: number;
  error?: string;
}
