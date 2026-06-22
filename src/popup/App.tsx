import React, { useState, useEffect, useCallback } from 'react';
import CombinedVisualizer from './components/CombinedVisualizer';
import { DEFAULT_SETTINGS, type EQSettings, type AudioStats, type ExtensionMessage, type MessageResponse } from '../types';

const emptyStats: AudioStats = { peakDb: -90, rmsDb: -90, lufs: -24, peakReduction: 0, noiseFloorDb: -90 };

function EditableValue({ value, onChange, max, disabled }: { value: number, onChange: (v: number) => void, max: number, disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value.toString());

  useEffect(() => {
    if (!editing) setTempVal(value.toString());
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    let n = parseInt(tempVal, 10);
    if (isNaN(n)) {
      setTempVal(value.toString());
      return;
    }
    n = Math.max(0, Math.min(n, max));
    onChange(n);
  };

  if (editing && !disabled) {
    return (
      <input
        type="text"
        autoFocus
        value={tempVal}
        onChange={e => setTempVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()}
        style={{
          width: '40px', fontSize: '12px', textAlign: 'right',
          background: 'var(--background)', border: '1px solid var(--border)',
          color: 'var(--foreground)', borderRadius: '3px', outline: 'none',
          padding: '2px 4px'
        }}
      />
    );
  }

  return (
    <span 
      className="slider-val" 
      onClick={() => !disabled && setEditing(true)}
      style={{ cursor: disabled ? 'default' : 'text' }}
      title={disabled ? undefined : "Click to edit"}
    >
      {value}%
    </span>
  );
}

export default function App() {
  const [settings, setSettings] = useState<EQSettings>({ ...DEFAULT_SETTINGS });
  const [active, setActive] = useState(false);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [freqData, setFreqData] = useState<number[]>([]);
  const [contentType, setContentType] = useState(0);
  const [eqGains, setEqGains] = useState<number[]>([0,0,0,0,0,0,0,0,0,0]);
  const [stats, setStats] = useState<AudioStats>(emptyStats);

  useEffect(() => {
    chrome.tabs?.query({ active: true, currentWindow: true }).then(async tabs => {
      if (!tabs[0]) return;
      setCurrentTab(tabs[0]);
      chrome.runtime.sendMessage({ type: 'GET_STATE' } as ExtensionMessage, async (r: MessageResponse) => {
        if (r?.active && r?.tabId === tabs[0].id) {
          setActive(true);
          try {
            const s = await chrome.storage.local.get(`settings_${tabs[0].id}`);
            if (s[`settings_${tabs[0].id}`]) {
              setSettings(prev => ({ ...prev, ...(s[`settings_${tabs[0].id}`] as Partial<EQSettings>) }));
            }
          } catch {}
        }
      });
    });
  }, []);

  useEffect(() => {
    const h = (msg: ExtensionMessage) => {
      if (msg.type === 'FREQUENCY_DATA') {
        setFreqData(msg.payload.bands);
        if (msg.payload.contentType !== undefined) setContentType(msg.payload.contentType);
        if (msg.payload.eqGains) setEqGains(msg.payload.eqGains);
        if (msg.payload.stats) setStats(msg.payload.stats);
      }
    };
    chrome.runtime.onMessage.addListener(h);
    return () => chrome.runtime.onMessage.removeListener(h);
  }, []);

  const save = useCallback(async (s: EQSettings, id: number) => {
    try { await chrome.storage.local.set({ [`settings_${id}`]: s }); } catch {}
  }, []);

  const apply = useCallback((s: EQSettings) => {
    chrome.runtime.sendMessage({ type: 'EQ_UPDATE', payload: s } as ExtensionMessage);
  }, []);

  const toggle = useCallback((on: boolean) => {
    if (!currentTab?.id) return;
    setActive(on);
    chrome.runtime.sendMessage({ type: 'TOGGLE_TAB', payload: { tabId: currentTab.id, enabled: on } } as ExtensionMessage, (r: MessageResponse) => {
      if (r?.success) {
        if (on) { apply(settings); save(settings, currentTab.id!); }
        else { setStats(emptyStats); }
      } else if (on) { setActive(false); }
    });
  }, [currentTab, settings, apply, save]);

  const update = useCallback((p: Partial<EQSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...p };
      if (active && currentTab?.id) { apply(next); save(next, currentTab.id); }
      return next;
    });
  }, [active, currentTab, apply, save]);

  return (
    <div className="container">
      <div className="header">
        <div className="title-group">
          <h1 className="title">Lye Equalizer</h1>
          <span className="subtitle">Audio Enhancer</span>
        </div>
        <div className="switch" onClick={() => toggle(!active)}>
          <span className="switch-label">{active ? 'Active' : 'Off'}</span>
          <div className="switch-track" data-state={active ? 'checked' : 'unchecked'}>
            <div className="switch-thumb" />
          </div>
        </div>
      </div>

      <div className="canvas-card">
        <CombinedVisualizer
          freqData={freqData} eqGains={eqGains}
          active={active} bypass={settings.bypass}
          contentType={contentType} stats={stats}
        />
      </div>

      <div className="panel">
        <div className="row">
          <button 
            className="btn btn-fixed" data-state={settings.autoEQ ? 'on' : 'off'}
            onClick={() => update({ autoEQ: !settings.autoEQ })}
          >
            Lye EQ
          </button>
          <div className="slider-group">
            <input 
              type="range" min="0" max="100" 
              value={Math.round((settings.autoEQIntensity ?? 0.5) * 100)}
              onChange={e => update({ autoEQIntensity: +e.target.value / 100 })}
              disabled={!settings.autoEQ}
            />
            <EditableValue 
              value={Math.round((settings.autoEQIntensity ?? 0.5) * 100)}
              onChange={v => update({ autoEQIntensity: v / 100 })}
              max={100}
              disabled={!settings.autoEQ}
            />
          </div>
        </div>

        <div className="row">
          <button 
            className="btn btn-fixed" data-state={settings.loudnessNorm ? 'on' : 'off'}
            onClick={() => update({ loudnessNorm: !settings.loudnessNorm })}
          >
            Volume
          </button>
          <div className="slider-group">
            <input 
              type="range" min="0" max="200" 
              value={Math.round((settings.volume ?? 1) * 100)}
              onChange={e => update({ volume: +e.target.value / 100 })}
            />
            <EditableValue 
              value={Math.round((settings.volume ?? 1) * 100)}
              onChange={v => update({ volume: v / 100 })}
              max={200}
            />
          </div>
        </div>
      </div>

      <div className="footer">
        <span>Alt+E: Toggle</span>
        <span>Alt+B: Bypass</span>
      </div>
    </div>
  );
}
