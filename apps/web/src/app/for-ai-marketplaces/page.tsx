// app/for-ai-marketplaces/page.tsx
import { DemoPlayer, LiveDemoButton, ProofCard } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'Autonomous Agent Economies | Phoenix Zero for AI Marketplaces',
  description: 'Agents pay agents directly with cryptographically verifiable proofs. No intermediaries. Scale to millions without becoming the payment bottleneck.',
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
              Your marketplace loses <span className="text-white font-semibold">$200k/month</span> because agents can't trust each other. 
              You're the <span className="text-red-400 font-semibold">payment bottleneck</span> for 10,000+ agents.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <LiveDemoButton 
                demoType="ai-marketplace" 
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
                  You're the single point of failure for all agent payments
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Agents can't operate 24/7 without human approval
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  Manual payment processing limits scale to millions
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
                  Agents pay agents directly with cryptographic proofs
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  No intermediaries. No trust required.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  You become the trust facilitator, not the bottleneck
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Video Section */}
      <section id="watch-demo" className="py-16 px-6 bg-gray-900/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">See Autonomous Agents In Action</h2>
          <DemoPlayer 
            src="/demos/ai-marketplace-demo.mp4" 
            title="AI Marketplace Agent Economy Demo"
            poster="/demo-thumbnails/ai-marketplace.jpg"
          />
        </div>
      </section>

      {/* Proof Example */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">What the CTO Sees</h2>
          <ProofCard 
            proofId="ppo_AGENT_ECONOMY_001"
            title="Autonomous Transaction Complete"
            description="Two AI agents completed an economic transaction without human intervention. This is the first truly sovereign infrastructure for agent economies."
            metrics={[
              { label: 'Agents', value: '10K+' },
              { label: 'Human Intervention', value: 'Zero' },
            ]}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Scale to Millions of Agents?</h2>
          <p className="text-xl text-gray-400 mb-8">
            Join leading AI marketplaces that turned payment bottlenecks into autonomous agent economies.
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
