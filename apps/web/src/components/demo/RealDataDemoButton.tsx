// components/demo/RealDataDemoButton.tsx
'use client';

import { useState, useCallback } from 'react';

interface RealDataDemoButtonProps {
  demoType: 'exchange' | 'ai-marketplace' | 'gaming' | 'banking';
  buttonText?: string;
  className?: string;
}

interface DemoResult {
  success: boolean;
  mode?: 'auto' | 'batch' | 'transaction';
  paymentId?: string;
  proofId?: string;
  verifyUrl?: string;
  publicProofUrl?: string;
  dataSummary?: {
    kind: string;
    rows?: number;
    bytes: number;
    sha256Hex: string;
  };
  batchSummary?: {
    rowCount?: number;
    entryCount?: number;
    sumNotionalUsd?: number;
    distinctAssets?: string[];
    highRiskCount?: number;
    failedCount?: number;
    batchId?: string;
    settlementWindow?: string;
  };
  transactionResults?: Array<{
    rowIndex: number;
    paymentId: string;
    proofId: string;
    taskId: string;
    verifyUrl: string;
    publicProofUrl: string;
  }>;
  enterprise?: {
    pricing: string;
    roi: string;
  };
  error?: string;
}

export function RealDataDemoButton({ 
  demoType, 
  buttonText = "⚡ Run Demo with Your Data",
  className = ""
}: RealDataDemoButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [useFile, setUseFile] = useState(true);
  const [mode, setMode] = useState<'auto' | 'batch' | 'transaction'>('auto');

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setLogs([`📄 Selected file: ${selectedFile.name} (${selectedFile.size} bytes)`]);
    }
  }, []);

  const runDemo = async () => {
    if (!file && !rawText.trim()) {
      setLogs(['❌ Please select a file or enter raw text']);
      return;
    }

    setIsRunning(true);
    setResult(null);
    setLogs(prev => [...prev, '🚀 Starting demo with real business data...']);

    try {
      const formData = new FormData();
      formData.append('demoType', demoType);
      formData.append('mode', mode);
      
      if (file) {
        formData.append('file', file);
        setLogs(prev => [...prev, `📤 Uploading ${file.name}...`]);
      } else {
        formData.append('rawText', rawText);
        setLogs(prev => [...prev, '📤 Sending data...']);
      }

      const response = await fetch('/api/demo/run-with-data', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setLogs(prev => [
          ...prev, 
          '✅ Data uploaded and hashed',
          '💳 Checkout created',
          '💰 Payment confirmed',
          '⚡ Task executed with cryptographic proof'
        ]);
        setResult({
          success: true,
          mode: data.mode,
          paymentId: data.paymentId,
          proofId: data.proofId,
          verifyUrl: data.verifyUrl,
          publicProofUrl: data.publicProofUrl,
          dataSummary: data.dataSummary,
          batchSummary: data.batchSummary,
          transactionResults: data.transactionResults,
          enterprise: data.enterprise
        });
      } else {
        setLogs(prev => [...prev, `❌ Error: ${data.error || data.reason}`]);
        setResult({ success: false, error: data.error || data.reason });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLogs(prev => [...prev, `❌ Failed: ${errorMessage}`]);
      setResult({ success: false, error: errorMessage });
    } finally {
      setIsRunning(false);
    }
  };

  const verticalConfig = {
    exchange: {
      color: 'green',
      fileLabel: 'Settlement CSV/JSON',
      placeholder: 'id,amount,currency\ntx1,100,USD\ntx2,250,USD'
    },
    'ai-marketplace': {
      color: 'blue',
      fileLabel: 'Agent Transactions JSON',
      placeholder: '{"transactions":[{"id":"agent1","amount":10,"task":"compute"}]}'
    },
    gaming: {
      color: 'purple',
      fileLabel: 'Tournament Results CSV/JSON',
      placeholder: 'player_id,prize,currency\nplayer1,1000,USDC\nplayer2,500,USDC'
    },
    banking: {
      color: 'emerald',
      fileLabel: 'Transaction Batch CSV/JSON',
      placeholder: 'batch_id,amount,currency,date\nbatch1,50000,USD,2024-01-15'
    }
  };

  const config = verticalConfig[demoType];
  const colorClasses = {
    green: 'from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-green-500/25',
    blue: 'from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 shadow-blue-500/25',
    purple: 'from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 shadow-purple-500/25',
    emerald: 'from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-500/25'
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Mode selector */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">Processing mode</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'auto' | 'batch' | 'transaction')}
          disabled={isRunning}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-gray-500 disabled:opacity-50"
        >
          <option value="auto">Auto (recommended)</option>
          <option value="transaction">Per-transaction proofs (small volumes)</option>
          <option value="batch">Batch proof + summary (enterprise volumes)</option>
        </select>
        <p className="text-xs text-gray-500">
          Auto chooses transaction mode for small files and batch mode for large files.
        </p>
      </div>

      {/* Toggle between File and Raw Text */}
      <div className="flex gap-2 p-1 bg-gray-800 rounded-lg">
        <button
          onClick={() => setUseFile(true)}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            useFile ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          📁 Upload File
        </button>
        <button
          onClick={() => setUseFile(false)}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            !useFile ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          ✏️ Paste Data
        </button>
      </div>

      {/* File Upload or Raw Text Input */}
      {useFile ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            {config.fileLabel}
          </label>
          <input
            type="file"
            accept=".csv,.json"
            onChange={handleFileChange}
            disabled={isRunning}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-700 file:text-white hover:file:bg-gray-600 disabled:opacity-50"
          />
          <p className="text-xs text-gray-500">
            Accepted formats: CSV, JSON (max 10MB)
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Paste Your Data
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={config.placeholder}
            disabled={isRunning}
            rows={6}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500 disabled:opacity-50 font-mono"
          />
        </div>
      )}

      {/* Run Button */}
      <button
        onClick={runDemo}
        disabled={isRunning || (!file && !rawText.trim())}
        className={`
          w-full px-8 py-4 rounded-lg font-bold text-lg transition-all
          ${isRunning || (!file && !rawText.trim())
            ? 'bg-gray-600 cursor-not-allowed' 
            : `bg-gradient-to-r ${colorClasses[config.color as keyof typeof colorClasses]}`
          }
          text-white shadow-lg
        `}
      >
        {isRunning ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Processing Real Data...
          </span>
        ) : (
          buttonText
        )}
      </button>

      {/* Logs */}
      {logs.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
          {logs.map((log, i) => (
            <div key={i} className={`${log.startsWith('❌') ? 'text-red-400' : log.startsWith('✅') || log.startsWith('💰') || log.startsWith('⚡') ? 'text-green-400' : 'text-gray-300'}`}>
              {log}
            </div>
          ))}
          {isRunning && (
            <div className="flex items-center gap-2 mt-2 text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Processing...
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {result?.success && (
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-400 font-semibold">
            <span>✓</span>
            <span>Cryptographic proof generated from your data!</span>
          </div>

          {result.mode && (
            <div className="text-xs text-gray-400">
              Mode: <span className="text-green-300">{result.mode}</span>
            </div>
          )}
          
          {result.dataSummary && (
            <div className="text-sm text-gray-300 bg-gray-800/50 rounded p-3">
              <div className="font-medium text-gray-200 mb-2">Data Summary:</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Type: <span className="text-green-300">{result.dataSummary.kind}</span></div>
                {result.dataSummary.rows && (
                  <div>Rows: <span className="text-green-300">{result.dataSummary.rows}</span></div>
                )}
                <div>Size: <span className="text-green-300">{result.dataSummary.bytes} bytes</span></div>
                <div className="col-span-2 truncate">
                  Hash: <span className="text-green-300 font-mono">{result.dataSummary.sha256Hex.slice(0, 16)}...</span>
                </div>
              </div>
            </div>
          )}

          {result.batchSummary && (
            <div className="text-sm text-gray-300 bg-gray-800/50 rounded p-3">
              <div className="font-medium text-gray-200 mb-2">Batch Summary:</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {typeof result.batchSummary.rowCount === 'number' && (
                  <div>Row count: <span className="text-green-300">{result.batchSummary.rowCount}</span></div>
                )}
                {typeof result.batchSummary.sumNotionalUsd === 'number' && (
                  <div>Notional (USD): <span className="text-green-300">{result.batchSummary.sumNotionalUsd.toFixed(2)}</span></div>
                )}
                {typeof result.batchSummary.highRiskCount === 'number' && (
                  <div>High-risk: <span className="text-green-300">{result.batchSummary.highRiskCount}</span></div>
                )}
                {typeof result.batchSummary.failedCount === 'number' && (
                  <div>Failed: <span className="text-green-300">{result.batchSummary.failedCount}</span></div>
                )}
                {result.batchSummary.batchId && (
                  <div className="col-span-2">Batch ID: <span className="text-green-300">{result.batchSummary.batchId}</span></div>
                )}
                {result.batchSummary.settlementWindow && (
                  <div className="col-span-2">Window: <span className="text-green-300">{result.batchSummary.settlementWindow}</span></div>
                )}
                {result.batchSummary.distinctAssets?.length ? (
                  <div className="col-span-2">
                    Assets: <span className="text-green-300">{result.batchSummary.distinctAssets.join(', ')}</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {result.transactionResults?.length ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-200">Transaction proofs:</div>
              <div className="space-y-2">
                {result.transactionResults.map((tx) => (
                  <div key={tx.rowIndex} className="bg-gray-800/50 rounded border border-gray-700 p-3">
                    <div className="text-xs text-gray-400">Row {tx.rowIndex}</div>
                    <div className="text-xs text-gray-300 mt-1">
                      Payment: <code className="text-green-300">{tx.paymentId}</code>
                    </div>
                    <div className="text-xs text-gray-300">
                      Proof: <code className="text-green-300">{tx.proofId}</code>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <a
                        href={tx.verifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-medium transition-colors"
                      >
                        Verify
                      </a>
                      <a
                        href={tx.publicProofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-medium transition-colors"
                      >
                        API
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm text-gray-300 space-y-1">
                <div>Payment ID: <code className="text-green-300">{result.paymentId}</code></div>
                <div>Proof ID: <code className="text-green-300">{result.proofId}</code></div>
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href={result.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-medium transition-colors"
                >
                  🔍 Verify Proof
                </a>
                <a
                  href={result.publicProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium transition-colors"
                >
                  📄 Public API
                </a>
              </div>
            </>
          )}

          {result.enterprise && (
            <div className="mt-3 p-3 bg-gray-800/50 rounded border border-gray-700">
              <div className="text-sm font-medium text-gray-200">Enterprise Package</div>
              <div className="text-sm text-gray-400">{result.enterprise.pricing}</div>
              <div className="text-xs text-green-400 mt-1">{result.enterprise.roi}</div>
            </div>
          )}
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
