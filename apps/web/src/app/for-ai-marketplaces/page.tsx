// app/for-ai-marketplaces/page.tsx
import { LiveDemoButton, RealDataDemoButton } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'Autonomous Agent Economies | Phoenix Zero for AI Marketplaces',
  description:
    'Crypto-native agent-to-agent settlement with a public proof per execution. Upload your agent transaction data and see cryptographic verification.',
};

export default function AIMarketplaceLanding() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero Section */}
      <section className="relative py-20 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-gray-950 to-purple-900/20" />
        
        <div className="relative max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              For AI Marketplaces
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-300 bg-clip-text text-transparent">
              Autonomous Agent Economies
            </h1>
            
            <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-8">
              Phoenix Zero Sovereign enables crypto-native agent economies with a public proof per settlement.
              Upload your agent transaction data and see cryptographic verification in seconds.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <LiveDemoButton 
                demoType="ai-marketplace" 
                buttonText="⚡ Quick Demo (Simulated)"
              />
              <a 
                href="#real-data" 
                className="px-8 py-4 rounded-lg font-bold text-lg border border-blue-500/50 hover:border-blue-400 hover:bg-blue-900/20 transition-all"
              >
                🤖 Try with Agent Data
              </a>
            </div>
          </div>

          {/* Problem/Solution Cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-red-500/20 p-6">
              <h3 className="text-red-400 font-semibold text-lg mb-4 flex items-center gap-2">
                <span>❌</span> The Problem
              </h3>
              <ul className="space-y-3 text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Your platform is the trust bottleneck for agent payments
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Disputes require internal logs, screenshots, and manual reviews
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Counterparties cannot independently verify agent transactions
                </li>
              </ul>
            </div>
            
            <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-blue-500/20 p-6">
              <h3 className="text-blue-400 font-semibold text-lg mb-4 flex items-center gap-2">
                <span>✓</span> Our Solution
              </h3>
              <ul className="space-y-3 text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  Upload agent transaction JSON → get cryptographic proof in 60s
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  Each settlement emits a public verify URL (no trust required)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  Agents verify payments independently without platform access
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Real Data Demo Section */}
      <section id="real-data" className="py-16 px-6 bg-gray-900/30 border-y border-gray-800">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-4">
              <span>🔥</span> Live Agent Data Processing
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Upload Your Agent Transaction Data
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              See how your actual agent transactions transform into cryptographic proofs. 
              No mock data — your real agent settlements hashed and verified.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-blue-400 mb-4 flex items-center gap-2">
                <span>🚀</span> Run with Real Agent Data
              </h3>
              <RealDataDemoButton 
                demoType="ai-marketplace" 
                buttonText="Process My Agent Data"
              />
            </div>

            <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-300 mb-4">
                What Happens Next?
              </h3>
              <ol className="space-y-3 text-sm text-gray-400">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">1</span>
                  <span>Your agent JSON is hashed (SHA-256) for integrity</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">2</span>
                  <span>Sovereign checkout created for agent settlement</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">3</span>
                  <span>Payment confirmed → agent task executes with proof</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">4</span>
                  <span>Public verify URL generated — agents verify independently</span>
                </li>
              </ol>
            </div>
          </div>

          {/* Sample Data Download */}
          <div className="mt-8 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <p className="text-sm text-gray-400">
              <span className="text-blue-400">💡</span> Don't have agent data ready? 
              <button 
                onClick={() => {
                  const sample = JSON.stringify({
                    transactions: [
                      { id: 'agent_001', task: 'compute', amount: 10, currency: 'USDC', buyer: 'user_123' },
                      { id: 'agent_002', task: 'inference', amount: 25, currency: 'USDC', buyer: 'user_456' }
                    ]
                  }, null, 2);
                  const blob = new Blob([sample], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'sample-agent-transactions.json';
                  a.click();
                }}
                className="ml-2 text-blue-400 hover:text-blue-300 underline cursor-pointer"
              >
                Download sample JSON
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* Watch Demo Section */}
      <section id="watch-demo" className="py-16 px-6 bg-gray-900/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Watch the Overlay (Recorded Demo Template)</h2>
          <div className="rounded-xl overflow-hidden border border-gray-700 bg-gray-900 shadow-2xl">
            <iframe
              src="/demos/ai-marketplace-overlay.html"
              title="AI marketplace demo overlay"
              className="w-full"
              style={{ height: 520 }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
          <div className="text-sm text-gray-400 mt-3 text-center">
            Overlay source:{' '}
            <a className="underline" href="/demos/ai-marketplace-overlay.html" target="_blank" rel="noreferrer">
              /demos/ai-marketplace-overlay.html
            </a>
          </div>
        </div>
      </section>

      {/* Output Artifact */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">What You Get</h2>
          <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-blue-500/20 p-6">
            <div className="text-gray-300" style={{ lineHeight: 1.75 }}>
              After you run the live demo, you receive:
              <div className="mt-3 grid gap-2">
                <div>
                  - A <strong>proofId</strong> and a public <strong>verify URL</strong>
                </div>
                <div>
                  - A JSON artifact saved at{' '}
                  <a className="underline" href="/demos/ai-marketplace-report.json" target="_blank" rel="noreferrer">
                    /demos/ai-marketplace-report.json
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Scale to Millions of Agents?</h2>
          <p className="text-xl text-gray-400 mb-8">
            Bring one real agent settlement flow. We validate the proof semantics end-to-end in a short technical call.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link 
              href="/contact"
              className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 text-white rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-blue-500/25"
            >
              Schedule Enterprise Demo
            </Link>
            <a 
              href="/docs/enterprise-demos"
              className="px-8 py-4 border border-gray-600 hover:border-gray-400 rounded-lg font-bold text-lg transition-all"
            >
              View Documentation
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
