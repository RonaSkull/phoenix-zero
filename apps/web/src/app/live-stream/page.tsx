'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ModeToggle } from '../_components/ModeToggle';
import { PublicViewPreview } from '../_components/PublicViewPreview';
import { UsageGuide } from '../_components/UsageGuide';
import { useAdvancedMode } from '../_components/useAdvancedMode';

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

type JobStatus = 'running' | 'done' | 'error';

type LiveJob = {
  jobId: string;
  createdAt: string;
  status: JobStatus;
  policy: string;
  sessionProof: JsonValue;
  segments: { index: number; videoFile: string; proofFile: string; verify?: JsonValue; error?: string; qstepScore?: number }[];
  error?: string;
  finishRequestedAt?: string;
  segmentCount?: number;
  summaryAnyOk?: boolean;
  summaryAnyFail?: boolean;
  qstepScore?: number;
  qstepStatus?: 'valid' | 'degraded' | 'invalid';
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  const b64 = btoa(s);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function downloadFromUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function overallStatus(job: LiveJob | null): { label: string; color: string } {
  if (!job) return { label: 'Aguardando', color: '#666' };
  const anyFail = job.summaryAnyFail ?? (job.segments ?? []).some((s) => (s.verify as any)?.ok === false);
  const anyOk = job.summaryAnyOk ?? (job.segments ?? []).some((s) => (s.verify as any)?.ok === true);

  if (job.status === 'running') {
    if (anyFail) return { label: 'Autenticidade: NÃO confirmada', color: '#b00020' };
    if (anyOk) return { label: 'Autenticidade: CONFIRMADA', color: '#137333' };
    if (job.finishRequestedAt) return { label: 'Finalizando...', color: '#0b57d0' };
    return { label: 'Verificando ao vivo…', color: '#0b57d0' };
  }
  if (job.status === 'error') return { label: 'Erro na verificação', color: '#b00020' };

  if (anyFail) return { label: 'Autenticidade: NÃO confirmada', color: '#b00020' };
  if (anyOk) return { label: 'Autenticidade: CONFIRMADA', color: '#137333' };
  return { label: 'Concluído', color: '#666' };
}

function friendlyErrorMessage(error: string): string {
  const e = error.toLowerCase();
  if (e.includes('ffmpeg') && e.includes('enoent')) return 'Falha ao iniciar o processamento de vídeo no servidor.';
  if (e.includes('missing') && e.includes('signing key')) return 'Servidor sem chave de assinatura configurada.';
  if (e.includes('failed to fetch') || e.includes('networkerror') || e.includes('load failed')) {
    return 'Falha de conexão com o servidor. Verifique sua internet e tente novamente.';
  }
  return 'Falha ao processar/verificar o vídeo.';
}

export default function LiveStreamPage() {
  const [video, setVideo] = useState<File | null>(null);
  const [creatorId, setCreatorId] = useState<string>('');
  const [segmentSeconds, setSegmentSeconds] = useState<number>(3);
  const [mode, setMode] = useState<'compat' | 'strict'>('strict');
  const [policy, setPolicy] = useState<'sig+(wm|temporal)' | 'sig+wm+temporal'>('sig+(wm|temporal)');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [allowTechnical, setAllowTechnical] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);

  const { advanced } = useAdvancedMode();

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDeviceId, setVideoDeviceId] = useState<string>('');
  const [audioDeviceId, setAudioDeviceId] = useState<string>('');

  const [capturing, setCapturing] = useState(false);
  const [captureElapsedSec, setCaptureElapsedSec] = useState<number>(0);

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<LiveJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

   const ingestTokenRef = useRef<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const pollInFlightRef = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const segmentIndexRef = useRef<number>(0);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const segmentTimerRef = useRef<number | null>(null);
  const capturingRef = useRef<boolean>(false);

  const captureElapsedLabel = useMemo(() => {
    const m = Math.floor(captureElapsedSec / 60);
    const s = captureElapsedSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [captureElapsedSec]);

  useEffect(() => {
    if (!capturing) {
      setCaptureElapsedSec(0);
      return;
    }

    const t0 = Date.now();
    setCaptureElapsedSec(0);

    const t = window.setInterval(() => {
      setCaptureElapsedSec(Math.max(0, Math.floor((Date.now() - t0) / 1000)));
    }, 500);

    return () => {
      window.clearInterval(t);
    };
  }, [capturing]);

  useEffect(() => {
    let cancelled = false;
    async function loadDevices() {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setVideoDevices(list.filter((d) => d.kind === 'videoinput'));
        setAudioDevices(list.filter((d) => d.kind === 'audioinput'));
      } catch {
        if (cancelled) return;
        setVideoDevices([]);
        setAudioDevices([]);
      }
    }

    if (typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.enumerateDevices === 'function') {
      void loadDevices();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const startDisabled = useMemo(() => busy || !video, [busy, video]);

  const maxSegmentsCompact = useMemo(() => {
    if (showTechnical) return 200;
    if (viewOnly) return 1;
    return 1;
  }, [showTechnical, viewOnly]);
  const allSegments = job?.segments ?? [];
  const segmentCount = job?.segmentCount ?? allSegments.length;
  const visibleSegments = useMemo(() => {
    if (showTechnical) return allSegments;
    if (allSegments.length <= maxSegmentsCompact) return allSegments;
    return allSegments.slice(allSegments.length - maxSegmentsCompact);
  }, [allSegments, maxSegmentsCompact, showTechnical]);

  async function start() {
    if (!video) return;
    setBusy(true);
    setError(null);
    setJob(null);
    setJobId(null);
    setViewOnly(false);
    setShowTechnical(false);
    ingestTokenRef.current = null;

    try {
      const form = new FormData();
      form.set('action', 'start');
      form.set('video', video);
      if (creatorId.trim()) form.set('creatorId', creatorId.trim());
      form.set('segmentSeconds', String(segmentSeconds));
      form.set('mode', mode);
      form.set('policy', policy);

      const res = await fetch('/api/live-stream', { method: 'POST', body: form });
      const json = (await res.json().catch(async () => {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      })) as any;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.reason ?? `HTTP ${res.status}`);
      }
      setJobId(String(json.jobId));
      ingestTokenRef.current = typeof json.ingestToken === 'string' ? String(json.ingestToken) : null;
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('jobId', String(json.jobId));
        window.history.replaceState(null, '', url.toString());
      } catch {
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function startWebcam() {
    if (busy || capturing) return;
    setBusy(true);
    setError(null);
    setJob(null);
    setJobId(null);
    setViewOnly(false);
    setShowTechnical(false);
    segmentIndexRef.current = 0;
    ingestTokenRef.current = null;

    try {
      const res = await fetch('/api/live-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-webcam',
          creatorId: creatorId.trim() || undefined,
          segmentSeconds,
          mode,
          policy
        })
      });
      const json = (await res.json().catch(async () => {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      })) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.reason ?? `HTTP ${res.status}`);

      const newJobId = String(json.jobId);
      ingestTokenRef.current = typeof json.ingestToken === 'string' ? String(json.ingestToken) : null;
      setJobId(newJobId);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('jobId', newJobId);
        window.history.replaceState(null, '', url.toString());
      } catch {
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
      });
      mediaStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        void localVideoRef.current.play().catch(() => {
        });
      }

      function makeRecorder(s: MediaStream): MediaRecorder {
        try {
          return new MediaRecorder(s, { mimeType: 'video/webm;codecs=vp8,opus' });
        } catch {
          return new MediaRecorder(s);
        }
      }

      async function uploadSegment(params: {
        id: string;
        idx: number;
        blob: Blob;
        captureStartedAt: string;
        captureStoppedAt: string;
      }) {
        const ingestToken = ingestTokenRef.current;
        if (!ingestToken) throw new Error('Missing ingest token');

        let clientEntropyB64Url: string | null = null;
        let clientEntropyFrames: number | null = null;
        try {
          const ab = await params.blob.arrayBuffer();
          const u8 = new Uint8Array(ab);
          const take = Math.min(131072, u8.length);
          const sampleLen = u8.length > take * 2 ? take * 2 : u8.length;
          const sample = new Uint8Array(sampleLen);
          if (u8.length > take * 2) {
            sample.set(u8.subarray(0, take), 0);
            sample.set(u8.subarray(u8.length - take), take);
          } else {
            sample.set(u8);
          }

          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', sample));
          clientEntropyB64Url = bytesToBase64Url(digest);
        } catch {
        }

        try {
          const t0 = Date.parse(params.captureStartedAt);
          const t1 = Date.parse(params.captureStoppedAt);
          const durSec = Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0, (t1 - t0) / 1000) : 0;
          const fr = mediaStreamRef.current?.getVideoTracks?.()?.[0]?.getSettings?.()?.frameRate;
          if (typeof fr === 'number' && Number.isFinite(fr) && fr > 0 && durSec > 0) {
            clientEntropyFrames = Math.max(1, Math.round(durSec * fr));
          }
        } catch {
        }

        const form = new FormData();
        form.set('action', 'append');
        form.set('jobId', params.id);
        form.set('ingestToken', ingestToken);
        form.set('index', String(params.idx));
        form.set('segment', params.blob, `segment-${String(params.idx).padStart(4, '0')}.webm`);
        form.set('clientCaptureStartedAt', params.captureStartedAt);
        form.set('clientCaptureStoppedAt', params.captureStoppedAt);
        form.set('clientUserAgent', navigator.userAgent);
        if (clientEntropyB64Url) form.set('clientEntropyB64Url', clientEntropyB64Url);
        if (clientEntropyFrames !== null) form.set('clientEntropyFrames', String(clientEntropyFrames));
        const uploadStartedAtMs = performance.now();
        const r = await fetch('/api/live-stream', { method: 'POST', body: form });
        const uploadMs = Math.max(0, Math.round(performance.now() - uploadStartedAtMs));
        if (!r.ok) {
          const txt = await r.text().catch(() => '');
          throw new Error(txt || `HTTP ${r.status}`);
        }

        try {
          // best-effort: store a consistent upload duration even though append is fire-and-forget on the server
          void fetch('/api/live-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'segment-telemetry',
              jobId: params.id,
              ingestToken,
              index: params.idx,
              clientUploadMs: uploadMs,
              clientUserAgent: navigator.userAgent
            })
          }).catch(() => {
          });
        } catch {
        }
      }

      function recordNext() {
        if (!mediaStreamRef.current) return;
        if (!capturingRef.current) return;

        const captureStartedAt = new Date().toISOString();

        const recorder = makeRecorder(mediaStreamRef.current);
        mediaRecorderRef.current = recorder;

        const chunks: Blob[] = [];
        recorder.ondataavailable = (ev: BlobEvent) => {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };

        recorder.onstop = () => {
          const captureStoppedAt = new Date().toISOString();
          const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
          if (blob.size > 0) {
            const idx = segmentIndexRef.current++;
            const id = newJobId;
            uploadQueueRef.current = uploadQueueRef.current
              .then(() => uploadSegment({ id, idx, blob, captureStartedAt, captureStoppedAt }))
              .catch((e) => {
                const msg = e instanceof Error ? e.message : String(e);
                setError(msg);
              });
          }

          if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
          segmentTimerRef.current = null;

          if (capturingRef.current) recordNext();
        };

        recorder.start();
        const durMs = Math.max(1, Math.floor(segmentSeconds)) * 1000;
        segmentTimerRef.current = window.setTimeout(() => {
          try {
            recorder.stop();
          } catch {
          }
        }, durMs);
      }

      capturingRef.current = true;
      setCapturing(true);
      recordNext();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      try {
        mediaRecorderRef.current?.stop();
      } catch {
      }
      mediaRecorderRef.current = null;
      if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
      for (const t of mediaStreamRef.current?.getTracks?.() ?? []) t.stop();
      mediaStreamRef.current = null;
      capturingRef.current = false;
      setCapturing(false);
    } finally {
      setBusy(false);
    }
  }

  async function stopWebcam() {
    if (!capturing) return;
    capturingRef.current = false;
    setCapturing(false);
    if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
    segmentTimerRef.current = null;
    try {
      mediaRecorderRef.current?.stop();
    } catch {
    }
    mediaRecorderRef.current = null;
    for (const t of mediaStreamRef.current?.getTracks?.() ?? []) t.stop();
    mediaStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    if (jobId) {
      try {
        await uploadQueueRef.current;
        const ingestToken = ingestTokenRef.current;
        if (!ingestToken) throw new Error('Missing ingest token');
        await fetch('/api/live-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'finish', jobId, ingestToken })
        });
      } catch {
      }
    }
  }

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const existing = url.searchParams.get('jobId');
      const technical = url.searchParams.get('technical') === '1';
      if (allowTechnical !== technical) setAllowTechnical(technical);
      if (technical && !showTechnical) setShowTechnical(true);
      if (existing && !jobId) {
        setJobId(existing);
        setViewOnly(true);
      }
    } catch {
    }
  }, [allowTechnical, jobId, showTechnical]);

  useEffect(() => {
    if (!advanced && !allowTechnical && showTechnical) setShowTechnical(false);
  }, [advanced, allowTechnical, showTechnical]);

  useEffect(() => {
    if (viewOnly) setShowTechnical(false);
  }, [viewOnly]);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
      }
      mediaRecorderRef.current = null;
      if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
      for (const t of mediaStreamRef.current?.getTracks?.() ?? []) t.stop();
      mediaStreamRef.current = null;
      capturingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!capturing) return;
    let cancelled = false;
    let attempts = 0;

    const attach = () => {
      if (cancelled) return;
      const stream = mediaStreamRef.current;
      const el = localVideoRef.current;
      if (stream && el) {
        if (el.srcObject !== stream) el.srcObject = stream;
        el.onloadedmetadata = () => {
          void el.play().catch(() => {
          });
        };
        void el.play().catch(() => {
        });
        return;
      }

      attempts++;
      if (attempts < 30) {
        window.requestAnimationFrame(attach);
      }
    };

    attach();
    return () => {
      cancelled = true;
    };
  }, [capturing]);

  useEffect(() => {
    if (!viewOnly && capturing && job?.status === 'error') {
      void stopWebcam();
    }
  }, [capturing, job?.status, viewOnly]);

  useEffect(() => {
    async function pollOnce(id: string, signal?: AbortSignal) {
      try {
        const q = showTechnical ? `&full=1` : `&tail=${encodeURIComponent(String(maxSegmentsCompact))}`;
        const res = await fetch(`/api/live-stream?jobId=${encodeURIComponent(id)}${q}`, { signal });
        if (!res.ok) {
          if (res.status === 404) {
            setError('Sessão não encontrada (talvez expirou ou foi reiniciada).');
            return;
          }
          const txt = await res.text().catch(() => '');
          throw new Error(txt || `HTTP ${res.status}`);
        }

        const json = (await res.json()) as any;
        if (!json?.ok) throw new Error(json?.reason ?? 'Falha ao consultar o status da sessão.');
        setJob(json.job as LiveJob);
        if (json.job?.status === 'done' || json.job?.status === 'error') {
          return 'stop' as const;
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : String(e);
        if (/failed to fetch|networkerror|load failed/i.test(msg)) {
          setError('Falha de conexão com o servidor. Verifique sua internet e tente novamente.');
        } else {
          setError(msg);
        }
      }
    }

    if (!jobId) return;

    let cancelled = false;
    const ac = new AbortController();

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') {
        pollRef.current = window.setTimeout(() => {
          void tick();
        }, 1500);
        return;
      }

      if (pollInFlightRef.current) {
        pollRef.current = window.setTimeout(() => {
          void tick();
        }, 250);
        return;
      }

      pollInFlightRef.current = true;
      const stop = await pollOnce(jobId, ac.signal);
      pollInFlightRef.current = false;

      if (stop === 'stop') return;
      pollRef.current = window.setTimeout(() => {
        void tick();
      }, 1000);
    };

    void tick();

    return () => {
      cancelled = true;
      ac.abort();
      pollInFlightRef.current = false;
      if (pollRef.current) window.clearTimeout(pollRef.current);
      pollRef.current = null;
    };
  }, [jobId, showTechnical, maxSegmentsCompact]);

  const shareUrl = useMemo(() => {
    if (!jobId) return null;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('jobId', jobId);
      url.searchParams.delete('technical');
      return url.toString();
    } catch {
      return null;
    }
  }, [jobId]);

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
    }
  }

  return (
    <main className="pz-shell pz-shell--mono">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="pz-topline">
              <div className="pz-kicker">Phoenix Zero</div>
              <div className="pz-rule" />
            </div>
            <div className="pz-subtitle">{viewOnly ? 'Acompanhamento — Ao vivo' : 'Autenticação ao vivo'}</div>
            {!viewOnly ? (
              <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', color: '#B9C3D6', fontSize: 13 }}>
                <a className="pz-link" href="/creator">
                  Central do Cliente
                </a>
                <span style={{ opacity: 0.55 }}>→</span>
                <span style={{ color: '#E7ECF5', fontWeight: 800 }}>Ao vivo</span>
              </div>
            ) : null}
          </div>

          {!viewOnly ? (
            <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
              <ModeToggle label="Modo avançado" />
              <div style={{ color: '#8FA0BF', fontSize: 12, maxWidth: 360, textAlign: 'right', lineHeight: 1.35 }}>
                Básico: só o essencial. Avançado: mostra detalhes técnicos e diagnósticos.
              </div>
            </div>
          ) : null}
        </div>

        <div className={viewOnly ? 'pz-split-single' : 'pz-split-live'} style={{ flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
            <section className="pz-card-flat">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="pz-live-dot" />
                  <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>Verificação em tempo real</div>
                </div>
                {!viewOnly && jobId && (advanced || allowTechnical) ? <div className="pz-code">Sessão {jobId}</div> : null}
              </div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: overallStatus(job).color }}>{overallStatus(job).label}</div>
                {!viewOnly && jobId ? (
                  <div style={{ color: '#B9C3D6', fontSize: 13 }}>
                    Registros recebidos: <span style={{ color: '#E7ECF5', fontWeight: 800 }}>{segmentCount}</span>
                  </div>
                ) : null}
              </div>

              {jobId && job?.qstepStatus && showTechnical && (advanced || allowTechnical) ? (
                <div className="pz-card--subtle" style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 800 }}>Diagnóstico interno</div>
                  <div style={{ marginTop: 6, color: '#B9C3D6', fontSize: 13 }}>
                    Qualidade: <span style={{ color: '#E7ECF5', fontWeight: 800 }}>{job.qstepStatus}</span>
                    {typeof job.qstepScore === 'number' ? (
                      <span>
                        {' '}
                        (score: <span style={{ color: '#E7ECF5', fontWeight: 800 }}>{job.qstepScore}</span>)
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!viewOnly && shareUrl ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                  <div className="pz-card-flat--subtle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="pz-code">Link para o público verificar</div>
                      <div style={{ marginTop: 8, color: '#D7DEEE', fontSize: 14, wordBreak: 'break-all' }}>{shareUrl}</div>
                    </div>
                    <button type="button" onClick={copyShareLink} className="pz-btn pz-btn-primary">
                      Copiar link
                    </button>
                  </div>
                  <div style={{ color: '#B9C3D6', fontSize: 13 }}>Cole na descrição, chat ou overlay.</div>
                </div>
              ) : null}

              {job?.error ? (
                <div style={{ marginTop: 10, color: '#FFD1D1' }}>{!showTechnical ? friendlyErrorMessage(job.error) : job.error}</div>
              ) : null}

              {!job?.error && error ? <div style={{ marginTop: 10, color: '#FFD1D1' }}>{error}</div> : null}
            </section>

            {viewOnly ? (
              <section className="pz-card-flat">
                <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>Acompanhamento</div>
                <div style={{ marginTop: 8, color: '#B9C3D6', fontSize: 13 }}>Você está acompanhando a autenticação de uma transmissão ao vivo.</div>
              </section>
            ) : null}

            {jobId && !viewOnly ? (
              <section className="pz-card-flat" style={{ minHeight: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>
                    {(advanced || allowTechnical) && showTechnical ? 'Registros (detalhes)' : 'Registros de verificação'}
                  </div>
                  {!viewOnly && ((advanced || allowTechnical) || showTechnical) ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {showTechnical ? (
                        <button
                          type="button"
                          onClick={() => downloadFromUrl(`/api/live-stream?jobId=${encodeURIComponent(jobId)}&download=job`, `job-${jobId}.json`)}
                          className="pz-btn pz-btn-sm"
                        >
                          Baixar relatório (JSON)
                        </button>
                      ) : null}
                      {showTechnical ? (
                        <button
                          type="button"
                          onClick={() =>
                            downloadFromUrl(`/api/live-stream?jobId=${encodeURIComponent(jobId)}&qstep=1`, `diagnostico-${jobId}.json`)
                          }
                          className="pz-btn pz-btn-sm"
                        >
                          Baixar diagnóstico
                        </button>
                      ) : null}
                      {(advanced || allowTechnical) ? (
                        <button
                          type="button"
                          onClick={() => setShowTechnical((v) => !v)}
                          className="pz-btn pz-btn-sm"
                        >
                          {showTechnical ? 'Ocultar detalhes' : 'Detalhes técnicos'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {showTechnical ? (
                  <div style={{ marginTop: 10, color: '#8FA0BF', fontSize: 12, lineHeight: 1.4 }}>
                    Relatório (JSON): detalhes técnicos da sessão. Prova (JSON): arquivo para auditoria/integração.
                  </div>
                ) : null}

                <div className="pz-scroll" style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {visibleSegments.map((s) => (
                  <div key={s.index}>
                    <div
                      className="pz-card-flat--subtle"
                      style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px' }}
                    >
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                        <strong style={{ whiteSpace: 'nowrap' }}>Registro #{s.index + 1}</strong>
                        <span
                          style={{
                            color: s.error ? '#FFD1D1' : (s.verify as any)?.ok ? '#BFF3D1' : (s.verify as any)?.ok === false ? '#FFD1D1' : '#B9C3D6',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {s.error
                            ? 'ERRO'
                            : (s.verify as any)?.ok === true
                              ? 'OK'
                              : (s.verify as any)?.ok === false
                                ? 'FALHOU'
                                : 'Verificando…'}
                        </span>
                      </div>
                      {showTechnical ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() =>
                              downloadFromUrl(
                                `/api/live-stream?jobId=${encodeURIComponent(jobId)}&download=video&index=${s.index}`,
                                s.videoFile
                              )
                            }
                            className="pz-btn pz-btn-sm"
                          >
                            Baixar trecho
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadFromUrl(
                                `/api/live-stream?jobId=${encodeURIComponent(jobId)}&download=proof&index=${s.index}`,
                                s.proofFile
                              )
                            }
                            className="pz-btn pz-btn-sm"
                          >
                            Baixar prova (JSON)
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {showTechnical && s.verify ? (
                      <pre
                        style={{
                          marginTop: 8,
                          whiteSpace: 'pre-wrap',
                          background: 'rgba(0,0,0,0.18)',
                          padding: 10,
                          borderRadius: 8,
                          maxHeight: 220,
                          overflow: 'auto',
                          border: '1px solid rgba(255,255,255,0.10)',
                          color: '#C7D0E6',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word'
                        }}
                      >
                        {JSON.stringify(s.verify, null, 2)}
                      </pre>
                    ) : null}

                    {showTechnical && s.error ? (
                      <pre
                        style={{
                          marginTop: 8,
                          whiteSpace: 'pre-wrap',
                          background: 'rgba(0,0,0,0.18)',
                          padding: 10,
                          borderRadius: 8,
                          maxHeight: 220,
                          overflow: 'auto',
                          color: '#FFD1D1'
                        }}
                      >
                        {s.error}
                      </pre>
                    ) : null}
                  </div>
                ))}

                {!allSegments.length ? <div style={{ color: '#B9C3D6', fontSize: 13 }}>Aguardando o primeiro registro…</div> : null}
              </div>
            </section>
          ) : null}
        </div>

        {!viewOnly ? (
          <div className="pz-scroll" style={{ display: 'grid', gap: 12, alignContent: 'start', minHeight: 0, paddingRight: 2 }}>
            <section className="pz-card-flat">
              <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>Iniciar autenticação ao vivo</div>
              <div style={{ marginTop: 10, color: '#D7DEEE', fontSize: 14, lineHeight: 1.45 }}>
                Funciona com qualquer plataforma. Você mantém seu fluxo normal — aqui você cria uma sessão paralela de autenticação.
              </div>
              <div style={{ marginTop: 8, color: '#B9C3D6', fontSize: 13, lineHeight: 1.4 }}>
                Dica: no OBS, ative “Virtual Camera” e selecione-a como câmera.
              </div>

              <div style={{ marginTop: 10, color: '#8FA0BF', fontSize: 12, lineHeight: 1.4 }}>
                Para lives longas, a gravação completa fica com a própria plataforma/cliente. Aqui você gera registros e provas verificáveis; os trechos baixados são opcionais.
              </div>

              <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                <UsageGuide steps={['Inicie a autenticação', 'Copie o link público', 'Compartilhe com seu público']} />
                <PublicViewPreview description="Página pública provando a live em tempo real." />
              </div>

              <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                {!capturing ? (
                  <>
                    {videoDevices.length ? (
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ color: '#B9C3D6', fontSize: 13, fontWeight: 700 }}>Fonte de vídeo (opcional)</span>
                        <select
                          value={videoDeviceId}
                          onChange={(e) => setVideoDeviceId(e.target.value)}
                          className="pz-select"
                          style={{ maxWidth: 360 }}
                        >
                          <option value="">Padrão do sistema</option>
                          {videoDevices.map((d, idx) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || `Câmera ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {audioDevices.length ? (
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ color: '#B9C3D6', fontSize: 13, fontWeight: 700 }}>Fonte de áudio (opcional)</span>
                        <select
                          value={audioDeviceId}
                          onChange={(e) => setAudioDeviceId(e.target.value)}
                          className="pz-select"
                          style={{ maxWidth: 360 }}
                        >
                          <option value="">Padrão do sistema</option>
                          {audioDevices.map((d, idx) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || `Microfone ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </>
                ) : null}
                {capturing ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 900 }}>Sessão de autenticação ativa</div>
                      <button
                        type="button"
                        onClick={stopWebcam}
                        className="pz-btn pz-btn-ghost"
                      >
                        Encerrar autenticação
                      </button>
                    </div>
                    <div className="pz-video-frame">
                      <video ref={localVideoRef} muted playsInline autoPlay className="pz-video" />
                      <div className="pz-live-badge">
                        <span className="pz-live-badge-dot" />
                        AO VIVO
                      </div>
                      <div className="pz-time-badge">{captureElapsedLabel}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={startWebcam}
                      disabled={busy}
                      className="pz-btn pz-btn-accent"
                    >
                      Iniciar autenticação ao vivo
                    </button>
                  </div>
                )}

                {showTechnical ? (
                  <>
                    <label>
                      Vídeo
                      <input
                        style={{ display: 'block', marginTop: 6 }}
                        type="file"
                        accept="video/mp4,video/*"
                        onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => setShowAdvanced((v) => !v)}
                      className="pz-btn pz-btn-sm"
                      style={{ maxWidth: 260 }}
                    >
                      {showAdvanced ? 'Ocultar opções' : 'Opções (avançado)'}
                    </button>

                    {showAdvanced ? (
                      <div className="pz-card--subtle" style={{ display: 'grid', gap: 10 }}>
                        <label>
                          Criador (opcional)
                          <input
                            className="pz-input"
                            style={{ display: 'block', marginTop: 6, maxWidth: 420 }}
                            value={creatorId}
                            onChange={(e) => setCreatorId(e.target.value)}
                            placeholder="@creator"
                          />
                        </label>

                        <label>
                          Duração do registro (segundos)
                          <input
                            className="pz-input"
                            style={{ display: 'block', marginTop: 6, maxWidth: 140 }}
                            type="number"
                            min={1}
                            step={1}
                            value={segmentSeconds}
                            onChange={(e) => setSegmentSeconds(Number(e.target.value))}
                          />
                        </label>

                        <label>
                          Modo de assinatura
                          <select
                            className="pz-select"
                            style={{ display: 'block', marginTop: 6, maxWidth: 220 }}
                            value={mode}
                            onChange={(e) => setMode(e.target.value === 'compat' ? 'compat' : 'strict')}
                          >
                            <option value="strict">strict</option>
                            <option value="compat">compat</option>
                          </select>
                        </label>

                        <label>
                          Política
                          <select
                            className="pz-select"
                            style={{ display: 'block', marginTop: 6, maxWidth: 280 }}
                            value={policy}
                            onChange={(e) =>
                              setPolicy(e.target.value === 'sig+wm+temporal' ? 'sig+wm+temporal' : 'sig+(wm|temporal)')
                            }
                          >
                            <option value="sig+(wm|temporal)">assinatura + (watermark OU temporal)</option>
                            <option value="sig+wm+temporal">assinatura + watermark + temporal</option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    <button onClick={start} disabled={startDisabled} className="pz-btn pz-btn-primary" style={{ maxWidth: 260 }}>
                      {busy ? 'Iniciando…' : 'Iniciar verificação'}
                    </button>

                    <div style={{ color: '#B9C3D6', fontSize: 13 }}>Dica: use a Virtual Camera do OBS como fonte de vídeo.</div>
                  </>
                ) : null}

                {error ? <div style={{ whiteSpace: 'pre-wrap', color: '#FFD1D1' }}>{error}</div> : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>
      </div>
    </main>
  );
}
