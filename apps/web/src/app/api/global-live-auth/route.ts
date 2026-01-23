export const runtime = 'nodejs';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

type LiveJobSummary = {
  jobId: string;
  createdAt: string;
  status: 'running' | 'done' | 'error';
  finishRequestedAt?: string;
  segmentCount?: number;
  summaryAnyOk?: boolean;
  summaryAnyFail?: boolean;
  qstepScore?: number;
  qstepStatus?: 'valid' | 'degraded' | 'invalid';
  error?: string;
};

type LiveStreamResponse = {
  ok: boolean;
  job?: LiveJobSummary;
  reason?: string;
};

function mapLiveToCard(job: LiveJobSummary | null): { verified: boolean; decision: string; title: string; hint: string } {
  if (!job) {
    return {
      verified: false,
      decision: 'not_verified',
      title: 'Live — Sessão inválida',
      hint: 'Sessão não encontrada.'
    };
  }

  const anyFail = Boolean(job.summaryAnyFail);
  const anyOk = Boolean(job.summaryAnyOk);
  const qstepStatus = job.qstepStatus;
  const qstepScore = typeof job.qstepScore === 'number' ? job.qstepScore : undefined;

  if (job.status === 'error') {
    return {
      verified: false,
      decision: 'not_verified',
      title: 'Live — Erro',
      hint: job.error || 'Falha ao verificar.'
    };
  }

  if (anyFail) {
    return {
      verified: false,
      decision: 'suspected_impersonation',
      title: 'Live — Suspeito',
      hint: 'Um ou mais segmentos falharam.'
    };
  }

  if (!anyOk) {
    return {
      verified: false,
      decision: 'not_verified',
      title: 'Live — Verificando…',
      hint: job.finishRequestedAt ? 'Finalizando…' : 'Aguardando o primeiro segmento verificado.'
    };
  }

  if (qstepStatus === 'invalid') {
    return {
      verified: false,
      decision: 'verified_unregistered_creator',
      title: 'Live — Degradada',
      hint: `Q-STEP inválido${qstepScore !== undefined ? ` (score ${qstepScore})` : ''}.`
    };
  }

  if (qstepStatus === 'degraded') {
    return {
      verified: true,
      decision: 'verified_unregistered_creator',
      title: 'Live — Autêntico',
      hint: `Autenticidade confirmada (Q-STEP degradado${qstepScore !== undefined ? `, score ${qstepScore}` : ''}).`
    };
  }

  return {
    verified: true,
    decision: 'verified',
    title: 'Live — Autêntico ✅',
    hint: `Autenticidade confirmada${qstepStatus === 'valid' && qstepScore !== undefined ? ` (Q-STEP ${qstepScore})` : ''}.`
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const jobId = (u.searchParams.get('jobId') || '').trim();
    if (!jobId) {
      return Response.json({ ok: false, reason: 'Missing jobId' }, { status: 400, headers: corsHeaders() });
    }

    const base = `${u.protocol}//${u.host}`;
    const publicApiKey = (process.env.PHOENIX_ZERO_PUBLIC_API_KEY || '').trim();
    const liveRes = await fetch(new URL(`/api/live-stream?jobId=${encodeURIComponent(jobId)}&tail=6`, base).toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: publicApiKey ? { 'x-api-key': publicApiKey } : undefined
    });

    const liveJson = (await liveRes.json().catch(() => null)) as LiveStreamResponse | null;
    const job = liveJson?.ok && liveJson.job ? (liveJson.job as LiveJobSummary) : null;

    const mapped = mapLiveToCard(job);

    const shareUrl = new URL(`/live-stream?jobId=${encodeURIComponent(jobId)}`, base).toString();

    return Response.json(
      {
        ok: true,
        live: true,
        jobId,
        verified: mapped.verified,
        decision: mapped.decision,
        title: mapped.title,
        hint: mapped.hint,
        shareUrl,
        job: job
          ? {
              status: job.status,
              segmentCount: job.segmentCount,
              qstepStatus: job.qstepStatus,
              qstepScore: job.qstepScore,
              summaryAnyOk: job.summaryAnyOk,
              summaryAnyFail: job.summaryAnyFail
            }
          : null
      },
      { status: 200, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json(
      { ok: false, reason: message },
      { status: 500, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } }
    );
  }
}
