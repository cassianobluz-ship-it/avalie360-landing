// /api/cron-lembretes.js
// Executado automaticamente pelo Vercel Cron — envia lembretes para todas as orgs com ciclos ativos
// Configurar em vercel.json: { "crons": [{ "path": "/api/cron-lembretes", "schedule": "0 9 * * 1" }] }
// Executa toda segunda-feira às 9h UTC

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Vercel Cron envia header Authorization com CRON_SECRET
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Buscar todas as orgs com ciclo ativo
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, active_ciclo, base_url, slug')
    .not('active_ciclo', 'is', null);

  if (!orgs || orgs.length === 0) {
    return res.status(200).json({ msg: 'Nenhuma org com ciclo ativo' });
  }

  let totalEnviados = 0;

  for (const org of orgs) {
    try {
      // Buscar atribuições pendentes desta org
      const { data: atribuicoes } = await supabase
        .from('atribuicoes')
        .select('usuario_id')
        .eq('org_id', org.id)
        .eq('ciclo', org.active_ciclo)
        .eq('concluida', false);

      if (!atribuicoes || atribuicoes.length === 0) continue;

      const usuariosPendentes = [...new Set(atribuicoes.map(a => a.usuario_id))];
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id, nome, email')
        .in('id', usuariosPendentes)
        .eq('org_id', org.id)
        .eq('ativo', true);

      if (!usuarios || usuarios.length === 0) continue;

      const loginUrl = `${org.base_url || 'https://avalie360.vercel.app'}${org.slug ? `/${org.slug}/login` : ''}`;

      for (const u of usuarios) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Avalie360 <avalie360@conectandogente.com>',
              to: u.email,
              subject: `⏰ Lembrete: sua avaliação 360° está pendente — ${org.name}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
                <h2 style="color:#1e3a8a">Olá, ${u.nome}!</h2>
                <p style="color:#475569;line-height:1.7">Você ainda tem avaliações pendentes no ciclo <strong>${org.active_ciclo}</strong> de <strong>${org.name}</strong>.</p>
                <div style="text-align:center;margin:24px 0">
                  <a href="${loginUrl}" style="background:#2563eb;color:white;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Concluir avaliações →</a>
                </div>
                <p style="font-size:12px;color:#94a3b8">🔒 Respostas anônimas · LGPD conforme</p>
              </div>`,
            }),
          });
          totalEnviados++;
        } catch(e) {
          console.error(`Erro ao enviar para ${u.email}:`, e.message);
        }
      }
    } catch(e) {
      console.error(`Erro ao processar org ${org.id}:`, e.message);
    }
  }

  console.log(`Cron lembretes: ${totalEnviados} emails enviados`);
  return res.status(200).json({ enviados: totalEnviados, orgs: orgs.length });
};
