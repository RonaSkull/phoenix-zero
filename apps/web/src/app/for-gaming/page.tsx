// app/for-gaming/page.tsx
import { DemoPlayer, LiveDemoButton, ProofCard } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'Fraud-Proof Tournament Payouts | Phoenix Zero for Gaming',
  description: 'Every payout generates a public proof showing exactly who won and how much they received. Players verify themselves. Trust is everything.',
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
              Your $100k tournament loses <span className="text-white font-semibold">$15k/month</span> in player churn due to 
              payout <span className="text-red-400 font-semibold">manipulation complaints</span>. Trust is everything.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <LiveDemoButton 
                demoType="gaming" 
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
                  Players accuse you of favoritism and manipulation
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Hours defending integrity on Discord and forums
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  One scandal = player exodus and revenue collapse
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
                  Every payout generates a public, verifiable proof
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-500">•</span>
                  Players verify themselves — no trust required
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-500">•</span>
                  Transform from gaming platform to trust institution
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Video Section */}
      <section id="watch-demo" className="py-16 px-6 bg-gray-900/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">See Proven-Fair Payouts In Action</h2>
          <DemoPlayer 
            src="/demos/gaming-demo.mp4" 
            title="Esports Tournament Payout Demo"
            poster="/demo-thumbnails/gaming.jpg"
          />
        </div>
      </section>

      {/* Proof Example */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">What Players See</h2>
          <ProofCard 
            proofId="ppo_ESPORTS_1ST"
            title="Fraud-Proof Tournament Results"
            description="Every payout is cryptographically proven. Players don't need to trust you — they can verify the math themselves."
            metrics={[
              { label: '1st Place', value: '$50K' },
              { label: 'Verifiable', value: '100%' },
            ]}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Become a Trust Institution?</h2>
          <p className="text-xl text-gray-400 mb-8">
            Join leading esports platforms that turned Discord drama into mathematical certainty.
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
