// /api/create-org-free.js
// Cria organização gratuitamente quando cupom é 100% — pula o Stripe
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

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await parseBody(req);
  const { orgName, orgSlug, adminName, adminEmail, numColabs, orgType, cupomCode } = body;

  if (!orgName || !orgSlug || !adminName || !adminEmail) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Validar cupom 100%
  const { data: cupom } = await supabase
    .from('cupons')
    .select('*')
    .eq('codigo', (cupomCode || '').toUpperCase().trim())
    .eq('ativo', true)
    .single();

  if (!cupom || cupom.desconto_pct !== 100) {
    return res.status(400).json({ error: 'Cupom inválido ou não é 100%.' });
  }
  if (cupom.usos_max !== null && cupom.usos >= cupom.usos_max) {
    return res.status(400).json({ error: 'Cupom atingiu o limite de usos.' });
  }
  if (!['contratacao','ambos'].includes(cupom.aplicavel_em)) {
    return res.status(400).json({ error: 'Cupom não aplicável à contratação.' });
  }

  // Verificar se org já existe
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();

  if (existing) {
    return res.status(400).json({ error: 'Este identificador de URL já está em uso. Escolha outro.' });
  }

  const adminPassword = generatePassword(12);
  const orgId = `${orgSlug}-${Math.random().toString(36).substring(2, 10)}`;

  const { error: orgError } = await supabase.from('organizations').insert({
    id: orgId,
    name: orgName,
    slug: orgSlug,
    admin_password: adminPassword,
    primary_color: '#2563eb',
    logo_url: '',
    base_url: 'https://avalie360.vercel.app',
    active_ciclo: '2026 - 1º Semestre',
    scale_labels: {"0":"Não sei avaliar","1":"Raramente","2":"Às vezes","3":"Frequentemente","4":"Sempre"},
    scale_model: 'frequencia',
    yesno_labels: {"0":"Não","1":"Sim","2":"Atenção"},
    org_type: orgType || 'religiosa',
    plan_custom: false,
  });

  if (orgError) {
    console.error('Supabase insert error:', orgError);
    return res.status(500).json({ error: 'Erro ao criar organização' });
  }

  // Incrementar uso do cupom
  await supabase.from('cupons').update({ usos: (cupom.usos || 0) + 1 }).eq('id', cupom.id);

  // Enviar email de boas-vindas
  const loginUrl = 'https://avalie360.vercel.app';
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Avalie360 <avalie360@conectandogente.com>',
        to: adminEmail,
        subject: `✅ Avalie360 — Sua conta está pronta, ${adminName.split(' ')[0]}!`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:32px;text-align:center;border-radius:16px 16px 0 0">
            <div style="font-size:28px;font-weight:800;color:white">Avalie360</div>
            <div style="color:rgba(255,255,255,.75);font-size:14px;margin-top:6px">Conta criada com sucesso!</div>
          </div>
          <div style="padding:32px;background:white;border-radius:0 0 16px 16px;border:1px solid #e2e8f0">
            <p>Olá, <strong>${adminName}</strong>! 👋</p>
            <p>Sua organização <strong>${orgName}</strong> está pronta para usar.</p>
            <div style="background:#eff6ff;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #2563eb">
              <p style="margin:0 0 8px;font-size:13px;color:#64748b">Identificador: <strong>${orgSlug}</strong></p>
              <p style="margin:0;font-size:13px;color:#64748b">Senha do administrador: <strong style="font-size:18px;font-family:monospace;background:#dbeafe;padding:4px 10px;border-radius:4px">${adminPassword}</strong></p>
            </div>
            <p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;font-size:13px">⚠️ <strong>Salve esta senha agora</strong> — ela não será exibida novamente.</p>
            <div style="text-align:center;margin:24px 0">
              <a href="${loginUrl}" style="background:#2563eb;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">Acessar o painel →</a>
            </div>
            <p style="font-size:13px;color:#64748b">Dúvidas? WhatsApp <a href="https://wa.me/5511986096470">(11) 98609-6470</a> ou <a href="mailto:avalie360@conectandogente.com">avalie360@conectandogente.com</a></p>
          </div>
        </div>`,
      }),
    });
  } catch(e) { console.error('Email error:', e); }

  return res.status(200).json({ ok: true, orgId, orgSlug });
};
