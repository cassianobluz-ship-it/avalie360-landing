// /api/send-notifications.js
// Envia convites ou lembretes por email para colaboradores com avaliações pendentes
const { createClient } = require('@supabase/supabase-js');

async function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', chunk => { data += chunk.toString(); });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await parseBody(req);
  const { orgId, orgName, ciclo, tipo, baseUrl, slug } = body;

  if (!orgId || !ciclo || !tipo) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Buscar atribuições pendentes do ciclo
  const { data: atribuicoes } = await supabase
    .from('atribuicoes')
    .select('usuario_id, concluida')
    .eq('org_id', orgId)
    .eq('ciclo', ciclo)
    .eq('concluida', false);

  if (!atribuicoes || atribuicoes.length === 0) {
    return res.status(200).json({ enviados: 0, ignorados: 0, msg: 'Nenhuma atribuição pendente' });
  }

  // IDs únicos de usuários com pendências
  const usuariosPendentes = [...new Set(atribuicoes.map(a => a.usuario_id))];

  // Buscar dados dos usuários
  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nome, email')
    .in('id', usuariosPendentes)
    .eq('org_id', orgId)
    .eq('ativo', true);

  if (!usuarios || usuarios.length === 0) {
    return res.status(200).json({ enviados: 0, ignorados: 0 });
  }

  const loginUrl = `${baseUrl || 'https://avalie360.vercel.app'}${slug ? `/${slug}/login` : ''}`;
  const assunto = tipo === 'convite'
    ? `📋 Convite para avaliação 360° — ${orgName}`
    : `⏰ Lembrete: sua avaliação 360° está pendente — ${orgName}`;

  const htmlBase = (nome) => tipo === 'convite' ? `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:28px 32px;border-radius:14px 14px 0 0;text-align:center">
        <div style="font-size:26px;font-weight:800;color:white">Avalie360</div>
        <div style="color:rgba(255,255,255,.75);font-size:13px;margin-top:4px">Avaliação 360°</div>
      </div>
      <div style="background:white;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px">
        <p style="font-size:16px;color:#0f172a">Olá, <strong>${nome}</strong>! 👋</p>
        <p style="font-size:14px;color:#475569;line-height:1.7">Você foi convidado(a) a participar do ciclo de avaliação 360° de <strong>${orgName}</strong> — <strong>${ciclo}</strong>.</p>
        <p style="font-size:14px;color:#475569;line-height:1.7">A avaliação é anônima, leva em média 15 minutos e é fundamental para o desenvolvimento de cada pessoa da equipe.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${loginUrl}" style="background:#2563eb;color:white;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Acessar minhas avaliações →</a>
        </div>
        <p style="font-size:12px;color:#94a3b8;line-height:1.6">🔒 Suas respostas são completamente anônimas — ninguém saberá o que você respondeu individualmente. Dados em conformidade com a LGPD.</p>
        <hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0">
        <p style="font-size:12px;color:#94a3b8">Dúvidas? Fale com o administrador da sua organização.</p>
      </div>
    </div>` : `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#d97706,#f59e0b);padding:28px 32px;border-radius:14px 14px 0 0;text-align:center">
        <div style="font-size:26px;font-weight:800;color:white">Avalie360</div>
        <div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:4px">⏰ Lembrete de avaliação</div>
      </div>
      <div style="background:white;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px">
        <p style="font-size:16px;color:#0f172a">Olá, <strong>${nome}</strong>!</p>
        <p style="font-size:14px;color:#475569;line-height:1.7">Você ainda tem avaliações pendentes no ciclo <strong>${ciclo}</strong> de <strong>${orgName}</strong>. Não se esqueça de concluí-las!</p>
        <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:13px;color:#92400e">
          ⏰ Suas avaliações ainda estão abertas. Complete-as quando puder.
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${loginUrl}" style="background:#d97706;color:white;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Concluir minhas avaliações →</a>
        </div>
        <p style="font-size:12px;color:#94a3b8">🔒 Respostas anônimas · LGPD conforme · Leva ~15 minutos</p>
      </div>
    </div>`;

  let enviados = 0;
  const erros = [];

  for (const u of usuarios) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Avalie360 <avalie360@conectandogente.com>',
          to: u.email,
          subject: assunto,
          html: htmlBase(u.nome),
        }),
      });
      if (emailRes.ok) enviados++;
      else {
        const errText = await emailRes.text();
        erros.push({ email: u.email, erro: errText });
      }
    } catch(e) {
      erros.push({ email: u.email, erro: e.message });
    }
  }

  console.log(`Notificações enviadas: ${enviados}/${usuarios.length}`, erros.length > 0 ? erros : '');
  return res.status(200).json({ enviados, ignorados: 0, erros: erros.length });
};
