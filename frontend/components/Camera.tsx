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
      <div className="flex items-center justify-between p-3">
        <button onClick={onCancel} className="rounded bg-slate-800 px-3 py-2">
          Cancel
        </button>
        <span className="text-sm">Take photo</span>
      </div>
      {error ? (
        <div className="flex flex-1 items-center justify-center p-4 text-center">{error}</div>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="flex-1 object-cover" />
      )}
      <div className="p-4">
        <button onClick={handleCapture} disabled={!!error} className="w-full rounded bg-white px-3 py-3 text-black disabled:opacity-50">
          Capture
        </button>
      </div>
    </div>
  );
}
