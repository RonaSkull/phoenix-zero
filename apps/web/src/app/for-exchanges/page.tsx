// app/for-exchanges/page.tsx
import { LiveDemoButton, RealDataDemoButton } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'Regulatory Proof in 60 Seconds | Phoenix Zero for Crypto Exchanges',
  description:
    'Every crypto settlement can emit a public, cryptographically verifiable proof. Regulators and counterparties can verify without trusting your infrastructure.',
};

export default function ExchangeLanding() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero Section */}
      <section className="relative py-20 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-green-900/20 via-gray-950 to-blue-900/20" />
        
        <div className="relative max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-6">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              For Crypto Exchanges
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
              Regulatory Proof in 60 Seconds
            </h1>
            
            <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-8">
              Phoenix Zero Sovereign is crypto-only infrastructure that generates a public proof per settlement.
              Upload your actual settlement data and see cryptographic proof in seconds.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <LiveDemoButton 
                demoType="exchange" 
                buttonText="⚡ Quick Demo (Simulated)"
              />
              <a 
                href="#real-data" 
                className="px-8 py-4 rounded-lg font-bold text-lg border border-green-500/50 hover:border-green-400 hover:bg-green-900/20 transition-all"
              >
                � Try with Real Data
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
                  Settlement evidence lives in internal systems and screenshots
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Auditors and counterparties must trust your exports and logs
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Any mismatch becomes a high-cost, high-latency investigation
                </li>
              </ul>
            </div>
            
            <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-green-500/20 p-6">
              <h3 className="text-green-400 font-semibold text-lg mb-4 flex items-center gap-2">
                <span>✓</span> Our Solution
              </h3>
              <ul className="space-y-3 text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-green-500">•</span>
                  Upload your settlement CSV → get cryptographic proof in 60s
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">•</span>
                  Each settlement emits a public verify URL (no trust required)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">•</span>
                  Regulators verify independently without accessing your systems
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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-4">
              <span>🔥</span> Live Real Data Processing
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Upload Your Settlement Data
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              See how your actual settlement CSV transforms into a cryptographic proof. 
              No mock data — your real transactions hashed and verified.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-green-400 mb-4 flex items-center gap-2">
                <span>🚀</span> Run with Real Data
              </h3>
              <RealDataDemoButton 
                demoType="exchange" 
                buttonText="Process My Settlement Data"
              />
            </div>

            <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-300 mb-4">
                What Happens Next?
              </h3>
              <ol className="space-y-3 text-sm text-gray-400">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">1</span>
                  <span>Your CSV/JSON is hashed (SHA-256) for integrity</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">2</span>
                  <span>Sovereign checkout created for settlement execution</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">3</span>
                  <span>Payment confirmed → task executes with proof</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">4</span>
                  <span>Public verify URL generated — share with auditors</span>
                </li>
              </ol>
            </div>
          </div>

          {/* Sample Data Download */}
          <div className="mt-8 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <p className="text-sm text-gray-400">
              <span className="text-green-400">💡</span> Don't have data ready? 
              <a 
                href="/templates/exchange_settlement_template.csv"
                download
                className="ml-2 text-green-400 hover:text-green-300 underline cursor-pointer"
              >
                Download enterprise settlement template
              </a>
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Includes: transaction_id, settlement_date, asset_type, amount, fee, counterparty_wallet, blockchain_tx_hash, order_id, trade_type, settlement_status
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
              src="/demos/exchange-overlay.html"
              title="Exchange demo overlay"
              className="w-full"
              style={{ height: 520 }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
          <div className="text-sm text-gray-400 mt-3 text-center">
            Overlay source: <a className="underline" href="/demos/exchange-overlay.html" target="_blank" rel="noreferrer">/demos/exchange-overlay.html</a>
          </div>
        </div>
      </section>

      {/* Output Artifact */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">What You Get</h2>
          <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-green-500/20 p-6">
            <div className="text-gray-300" style={{ lineHeight: 1.75 }}>
              After you run the live demo, you receive:
              <div className="mt-3 grid gap-2">
                <div>
                  - A <strong>proofId</strong> and a public <strong>verify URL</strong>
                </div>
                <div>
                  - A JSON artifact saved at <a className="underline" href="/demos/exchange-report.json" target="_blank" rel="noreferrer">/demos/exchange-report.json</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Eliminate Manual Audits?</h2>
          <p className="text-xl text-gray-400 mb-8">
            Bring one real settlement flow. We run a short technical call and validate the proof semantics end-to-end.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link 
              href="/contact"
              className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-green-500/25"
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
