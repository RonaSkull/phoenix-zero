// components/demo/ProofCard.tsx
import Link from 'next/link';

interface ProofCardProps {
  proofId: string;
  title: string;
  description: string;
  metrics?: {
    label: string;
    value: string;
  }[];
}

export function ProofCard({ proofId, title, description, metrics }: ProofCardProps) {
  return (
    <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-green-500/30 p-6 hover:border-green-500/50 transition-colors">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        <div className="flex-1">
          <h3 className="text-xl font-bold text-green-400 mb-2">{title}</h3>
          <p className="text-gray-300 mb-4">{description}</p>
          
          {metrics && metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              {metrics.map((metric, i) => (
                <div key={i} className="bg-gray-900/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-white">{metric.value}</div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">{metric.label}</div>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex gap-3">
            <Link
              href={`/verify/${proofId}`}
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Verify Publicly
            </Link>
            
            <Link
              href={`/api/guarantee-proofs/${proofId}`}
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              View JSON
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
