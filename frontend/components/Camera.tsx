import { useEffect, useRef, useState } from 'react';

interface CameraProps {
  onCapture: (base64: string) => void;
  onCancel: () => void;
}

export function Camera({ onCapture, onCancel }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setError('Camera access is required.');
      }
    };
    void start();
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/jpeg', 0.7));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div
        className="flex items-center justify-between px-4 pb-3"
        style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
      >
        <button
          onClick={onCancel}
          className="flex items-center justify-center rounded-full border border-white/20 bg-slate-800/90 px-4 py-2 text-sm font-semibold text-white shadow-md active:bg-slate-700"
        >
          Cancel
        </button>
        <span className="text-base font-medium text-slate-200">Take photo</span>
        <div className="w-16" />
      </div>
      {error ? (
        <div className="flex flex-1 items-center justify-center p-4 text-center">{error}</div>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="flex-1 object-cover" />
      )}
      <div
        className="p-4"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleCapture}
          disabled={!!error}
          className="w-full rounded-2xl bg-white py-3.5 text-base font-bold text-slate-900 transition active:scale-[0.98] disabled:opacity-50"
        >
          Capture
        </button>
      </div>
    </div>
  );
}
