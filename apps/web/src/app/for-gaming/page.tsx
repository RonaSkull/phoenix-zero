// app/for-gaming/page.tsx
import { LiveDemoButton, RealDataDemoButton } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'Fraud-Proof Tournament Payouts | Phoenix Zero for Gaming',
  description: 'Every payout generates a public proof showing exactly who won and how much they received. Upload your tournament data and see cryptographic verification.',
};

export default function GamingLanding() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero Section */}
      <section className="relative py-20 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-gray-950 to-pink-900/20" />
        
        <div className="relative max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm mb-6">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              For Gaming & Esports
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-pink-300 bg-clip-text text-transparent">
              Fraud-Proof Tournament Payouts
            </h1>
            
            <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-8">
              Phoenix Zero Sovereign emits a public proof per crypto payout.
              Upload your tournament results and generate verifiable proof for every winner.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <LiveDemoButton 
                demoType="gaming" 
                buttonText="⚡ Quick Demo (Simulated)"
              />
              <a 
                href="#real-data" 
                className="px-8 py-4 rounded-lg font-bold text-lg border border-purple-500/50 hover:border-purple-400 hover:bg-purple-900/20 transition-all"
              >
                🏆 Try with Tournament Data
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
                  Players dispute results and payouts without independently verifiable evidence
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Incident response becomes screenshots, logs, and trust-based arguments
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Partners and sponsors demand stronger integrity guarantees
                </li>
              </ul>
            </div>
            
            <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-purple-500/20 p-6">
              <h3 className="text-purple-400 font-semibold text-lg mb-4 flex items-center gap-2">
                <span>✓</span> Our Solution
              </h3>
              <ul className="space-y-3 text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-purple-500">•</span>
                  Upload tournament CSV/JSON → get cryptographic proof in 60s
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-500">•</span>
                  Each payout emits a public verify URL (no trust required)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-500">•</span>
                  Players verify independently — complete payout transparency
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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm mb-4">
              <span>🔥</span> Live Tournament Data Processing
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Upload Your Tournament Results
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              See how your actual tournament data transforms into cryptographic payout proofs. 
              No mock data — your real winners and prizes hashed and verified.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-purple-400 mb-4 flex items-center gap-2">
                <span>🚀</span> Run with Real Tournament Data
              </h3>
              <RealDataDemoButton 
                demoType="gaming" 
                buttonText="Process My Tournament Data"
              />
            </div>

            <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-300 mb-4">
                What Happens Next?
              </h3>
              <ol className="space-y-3 text-sm text-gray-400">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">1</span>
                  <span>Your tournament CSV/JSON is hashed (SHA-256)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">2</span>
                  <span>Sovereign checkout created for mass payout</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">3</span>
                  <span>Payment confirmed → payouts execute with proof</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">4</span>
                  <span>Public verify URLs generated — players verify wins</span>
                </li>
              </ol>
            </div>
          </div>

          {/* Sample Data Download */}
          <div className="mt-8 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <p className="text-sm text-gray-400">
              <span className="text-purple-400">💡</span> Don't have tournament data ready? 
              <button 
                onClick={() => {
                  const sample = 'player_id,prize,currency,rank\nplayer1,1000,USDC,1\nplayer2,500,USDC,2\nplayer3,250,USDC,3\nplayer4,100,USDC,4';
                  const blob = new Blob([sample], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'sample-tournament-results.csv';
                  a.click();
                }}
                className="ml-2 text-purple-400 hover:text-purple-300 underline cursor-pointer"
              >
                Download sample CSV
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
              src="/demos/gaming-overlay.html"
              title="Gaming demo overlay"
              className="w-full"
              style={{ height: 520 }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
          <div className="text-sm text-gray-400 mt-3 text-center">
            Overlay source:{' '}
            <a className="underline" href="/demos/gaming-overlay.html" target="_blank" rel="noreferrer">
              /demos/gaming-overlay.html
            </a>
          </div>
        </div>
      </section>

      {/* Output Artifact */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">What You Get</h2>
          <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-purple-500/20 p-6">
            <div className="text-gray-300" style={{ lineHeight: 1.75 }}>
              After you run the live demo, you receive:
              <div className="mt-3 grid gap-2">
                <div>
                  - A <strong>proofId</strong> and a public <strong>verify URL</strong>
                </div>
                <div>
                  - A JSON artifact saved at{' '}
                  <a className="underline" href="/demos/gaming-report.json" target="_blank" rel="noreferrer">
                    /demos/gaming-report.json
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
          <h2 className="text-4xl font-bold mb-6">Ready to Become a Trust Institution?</h2>
          <p className="text-xl text-gray-400 mb-8">
            Bring one real payout flow. We validate the proof semantics end-to-end in a short technical call.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link 
              href="/contact"
              className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-purple-500/25"
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
