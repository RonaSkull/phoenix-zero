import VerifyImageClient from '../verify-image/verify-image-client';

export default function VerifyImageWmPage(props: { searchParams?: Record<string, string | string[] | undefined> }) {
  const sp = props.searchParams ?? {};
  const imageUrl = typeof sp.imageUrl === 'string' ? sp.imageUrl : '';
  const proofUrl = typeof sp.proofUrl === 'string' ? sp.proofUrl : '';
  const pageUrl = typeof sp.pageUrl === 'string' ? sp.pageUrl : '';

  return (
    <VerifyImageClient
      initialImageUrl={imageUrl}
      initialProofUrl={proofUrl}
      initialPageUrl={pageUrl}
      verifyApiPath="/api/phoenix-zero/verify-image-watermarked-by-url"
      sharePath="/verify-image-wm"
    />
  );
}
