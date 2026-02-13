// app/for-exchanges/page.tsx
import { DemoPlayer, LiveDemoButton, ProofCard } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'Regulatory Proof in 60 Seconds | Phoenix Zero for Crypto Exchanges',
  description: 'Eliminate manual compliance audits. Every crypto payment generates a cryptographically verifiable proof that regulators can verify in 10 seconds.',
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
              Your exchange spends <span className="text-white font-semibold">$250k–$1M/year</span> on manual compliance audits. 
              One SEC failure can cost <span className="text-red-400 font-semibold">$10M+</span> in fines.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <LiveDemoButton 
                demoType="exchange" 
                buttonText="⚡ Run Live Demo"
              />
              <a 
                href="#watch-demo" 
                className="px-8 py-4 rounded-lg font-bold text-lg border border-gray-600 hover:border-gray-400 hover:bg-gray-800/50 transition-all"
              >
                📺 Watch Demo
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
                  Days generating settlement reports for regulators
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Manual reconciliation of thousands of transactions
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  One mistake = millions in fines + reputation damage
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
                  Every payment generates cryptographic proof automatically
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">•</span>
                  Regulators verify in 10 seconds — no trust required
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">•</span>
                  Immutable audit trail exists independently of your infrastructure
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Video Section */}
      <section id="watch-demo" className="py-16 px-6 bg-gray-900/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">See It In Action</h2>
          <DemoPlayer 
            src="/demos/exchange-demo.mp4" 
            title="Crypto Exchange Compliance Demo"
            poster="/demo-thumbnails/exchange.jpg"
          />
        </div>
      </section>

      {/* Proof Example */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">What Regulators See</h2>
          <ProofCard 
            proofId="ppo_EXCHANGE_DEMO"
            title="Compliance Proof Generated"
            description="This is what a Chief Compliance Officer shares with the SEC. Zero trust required — they can verify independently."
            metrics={[
              { label: 'Settlement Amount', value: '$500K' },
              { label: 'Verification Time', value: '<10s' },
            ]}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Eliminate Manual Audits?</h2>
          <p className="text-xl text-gray-400 mb-8">
            Join leading exchanges that turned 3-day compliance processes into 10-second URL shares.
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
