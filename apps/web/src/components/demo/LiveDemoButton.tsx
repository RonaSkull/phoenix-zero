// components/demo/LiveDemoButton.tsx
'use client';

import { useState } from 'react';

interface LiveDemoButtonProps {
  demoType: 'exchange' | 'ai-marketplace' | 'gaming' | 'banking';
  buttonText?: string;
  className?: string;
}

interface DemoResult {
  success: boolean;
  paymentId?: string;
  proofId?: string;
  verifyUrl?: string;
  error?: string;
}

export function LiveDemoButton({ 
  demoType, 
  buttonText = "⚡ Run Live Demo",
  className = ""
}: LiveDemoButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const runDemo = async () => {
    setIsRunning(true);
    setResult(null);
    setLogs(['🚀 Starting live demo...']);

    try {
      const response = await fetch('/api/demo/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoType })
      });

      const data = await response.json();

      if (data.success) {
        setLogs(prev => [...prev, '✅ Checkout created', '💰 Payment confirmed', '⚡ Task executed']);
        setResult({
          success: true,
          paymentId: data.paymentId,
          proofId: data.proofId,
          verifyUrl: data.verifyUrl
        });
      } else {
        setLogs(prev => [...prev, `❌ Error: ${data.error}`]);
        setResult({ success: false, error: data.error });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLogs(prev => [...prev, `❌ Failed: ${errorMessage}`]);
      setResult({ success: false, error: errorMessage });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <button
        onClick={runDemo}
        disabled={isRunning}
        className={`
          px-8 py-4 rounded-lg font-bold text-lg transition-all
          ${isRunning 
            ? 'bg-gray-600 cursor-not-allowed' 
            : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-lg hover:shadow-green-500/25'
          }
          text-white
        `}
      >
        {isRunning ? (
          <span className="flex items-center gap-2">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Running Demo...
          </span>
        ) : (
          buttonText
        )}
      </button>

      {isRunning && logs.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
          {logs.map((log, i) => (
            <div key={i} className="text-gray-300">{log}</div>
          ))}
          <div className="flex items-center gap-2 mt-2 text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Processing...
          </div>
        </div>
      )}

      {result?.success && (
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-400 font-semibold">
            <span>✓</span>
            <span>Demo completed successfully!</span>
          </div>
          <div className="text-sm text-gray-300 space-y-1">
            <div>Payment ID: <code className="text-green-300">{result.paymentId}</code></div>
            <div>Proof ID: <code className="text-green-300">{result.proofId}</code></div>
          </div>
          <a
            href={result.verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-medium transition-colors"
          >
            🔍 Verify Proof
          </a>
        </div>
      )}

      {result?.error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-red-400">
          <span className="font-semibold">✗ Demo failed:</span> {result.error}
        </div>
      )}
    </div>
  );
}
