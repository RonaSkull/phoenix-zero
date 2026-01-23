import VerifyClient from './verify-client';

export default function VerifyPage(props: { searchParams?: Record<string, string | string[] | undefined> }) {
  const sp = props.searchParams ?? {};
  const videoUrl = typeof sp.videoUrl === 'string' ? sp.videoUrl : '';
  const proofUrl = typeof sp.proofUrl === 'string' ? sp.proofUrl : '';
  const pageUrl = typeof sp.pageUrl === 'string' ? sp.pageUrl : '';

  return <VerifyClient initialVideoUrl={videoUrl} initialProofUrl={proofUrl} initialPageUrl={pageUrl} />;
}
