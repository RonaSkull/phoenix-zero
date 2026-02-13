// app/for-banking/page.tsx
import { DemoPlayer, LiveDemoButton, ProofCard } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'BC/Febraban Reconciliation in 1 Click | Phoenix Zero for Digital Banks',
  description: 'Every transaction automatically generates BC/Febraban compliant audit trails. Close your books in 2 minutes, not 3 days. 90% cost reduction.',
};

export default function BankingLanding() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero Section */}
      <section className="relative py-20 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-gray-950 to-cyan-900/20" />
        
        <div className="relative max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm mb-6">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              For Digital Banks
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-cyan-400 to-blue-300 bg-clip-text text-transparent">
              BC/Febraban Reconciliation in 1 Click
            </h1>
            
            <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-8">
              Your digital bank spends <span className="text-white font-semibold">$500k/year</span> on manual reconciliation. 
              <span className="text-red-400 font-semibold">3 days/month</span> lost to manual work.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <LiveDemoButton 
                demoType="banking" 
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
                  3 days per month reconciling PIX and crypto transactions
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Manual exports, spreadsheet juggling, error-prone submissions
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  One mistake = regulatory headache and BC penalties
                </li>
              </ul>
            </div>
            
            <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-cyan-500/20 p-6">
              <h3 className="text-cyan-400 font-semibold text-lg mb-4 flex items-center gap-2">
                <span>✓</span> Our Solution
              </h3>
              <ul className="space-y-3 text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-500">•</span>
                  Every transaction auto-generates BC/Febraban audit trail
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-500">•</span>
                  Close your books in 2 minutes, not 3 days
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-500">•</span>
                  90% operational cost reduction, zero reconciliation errors
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Video Section */}
      <section id="watch-demo" className="py-16 px-6 bg-gray-900/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">See Automated Reconciliation In Action</h2>
          <DemoPlayer 
            src="/demos/banking-demo.mp4" 
            title="Digital Bank BC/Febraban Reconciliation Demo"
            poster="/demo-thumbnails/banking.jpg"
          />
        </div>
      </section>

      {/* Proof Example */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">What the CFO Sees</h2>
          <ProofCard 
            proofId="ppo_BANKING_RECON_001"
            title="BC/Febraban Reconciliation Ready"
            description="Monthly reconciliation that used to take 3 days now takes 2 minutes. Every transaction is born audit-ready for BC compliance."
            metrics={[
              { label: 'Time Saved', value: '90%' },
              { label: 'Transactions', value: '15K+' },
            ]}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready for 90% Cost Reduction?</h2>
          <p className="text-xl text-gray-400 mb-8">
            Join leading digital banks that turned 3-day reconciliation processes into single API calls.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link 
              href="/contact"
              className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-cyan-500/25"
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
