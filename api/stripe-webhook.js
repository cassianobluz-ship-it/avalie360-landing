// /api/stripe-webhook.js
// Vercel Serverless Function — recebe confirmação do Stripe e:
//   1. Cria a organização no Supabase
//   2. Envia email de boas-vindas via Resend
//
// Variáveis de ambiente necessárias na Vercel:
//   STRIPE_SECRET_KEY=sk_test_...
//   STRIPE_WEBHOOK_SECRET=whsec_...  (gerado no Stripe Dashboard > Webhooks)
//   SUPABASE_URL=https://tegktsjlpjvsbdrrugpp.supabase.co
//   SUPABASE_SERVICE_KEY=<sua service_role key do Supabase>
//   RESEND_API_KEY=re_NfUGqMGi_Gsszdevn96xyGzQXTVMFsVHM

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// ── UTILITÁRIO: hash simples (igual ao do App.jsx) ──
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ── GERADOR DE SENHA ──
function generatePassword(length = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── GERADOR DE COR PADRÃO ──
const DEFAULT_COLOR = '#2563eb';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    // Verifica assinatura do webhook
    event = stripe.webhooks.constructEvent(
      req.body, // raw body — ver nota abaixo
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Só processa pagamento bem-sucedido
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const { orgName, orgSlug, adminName, adminEmail, numColabs } = session.metadata;

  // ── 1. CRIAR ORG NO SUPABASE ──
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const adminPassword = generatePassword(12);
  const adminPasswordHash = simpleHash(adminPassword);

  // Verifica se org já existe (pagamento duplicado)
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();

  if (existing) {
    console.log(`Org ${orgSlug} já existe, pulando criação.`);
    return res.status(200).json({ received: true });
  }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: orgName,
      slug: orgSlug,
      admin_password: adminPasswordHash,
      primary_color: DEFAULT_COLOR,
      active_ciclo: '2026 - 1º Semestre',
      base_url: `https://avalie360.vercel.app`,
      notify_email: true,
      notify_telegram: false,
      resend_from_email: 'avalie360@conectandogente.com',
    })
    .select()
    .single();

  if (orgError) {
    console.error('Supabase org insert error:', orgError);
    return res.status(500).json({ error: 'Erro ao criar organização' });
  }

  console.log(`✅ Organização criada: ${orgSlug} (id: ${org.id})`);

  // ── 2. ENVIAR EMAIL DE BOAS-VINDAS via Resend ──
  const loginUrl = `https://avalie360.vercel.app/${orgSlug}/login`;
  const manualAdminUrl = 'https://avalie360.vercel.app/manual-admin'; // ajuste conforme hospedar
  const manualUserUrl = 'https://avalie360.vercel.app/manual-usuario';

  const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f9ff;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(37,99,235,.1)">
    <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:32px 36px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:white;letter-spacing:-0.5px">Avalie360</div>
      <div style="color:rgba(255,255,255,.75);font-size:14px;margin-top:6px">Sua conta foi criada com sucesso!</div>
    </div>
    <div style="padding:32px 36px">
      <p style="font-size:16px;color:#0f172a;margin-bottom:8px">Olá, <strong>${adminName}</strong>! 👋</p>
      <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:24px">
        O pagamento foi confirmado e sua organização <strong>${orgName}</strong> está pronta para usar. Aqui estão seus dados de acesso:
      </p>
      <!-- CREDENCIAIS -->
      <div style="background:#eff6ff;border-radius:12px;padding:20px 24px;margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">CREDENCIAIS DE ADMINISTRADOR</div>
        <div style="margin-bottom:8px"><span style="font-size:13px;color:#475569">URL de acesso admin:</span><br><a href="${loginUrl}" style="font-size:15px;font-weight:700;color:#2563eb">${loginUrl}</a></div>
        <div style="margin-bottom:8px"><span style="font-size:13px;color:#475569">Slug da organização:</span><br><strong style="font-size:15px;color:#0f172a">${orgSlug}</strong></div>
        <div><span style="font-size:13px;color:#475569">Senha de administrador:</span><br><strong style="font-size:18px;color:#0f172a;font-family:monospace;background:#e2e8f0;padding:4px 10px;border-radius:6px">${adminPassword}</strong></div>
      </div>
      <p style="font-size:13px;color:#94a3b8;margin-bottom:24px">⚠️ Salve esta senha em local seguro. Você pode alterá-la a qualquer momento no painel de configurações.</p>
      <!-- PRÓXIMOS PASSOS -->
      <div style="margin-bottom:24px">
        <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:12px">Próximos passos:</div>
        <div style="display:flex;gap:10px;margin-bottom:8px;align-items:flex-start">
          <div style="width:24px;height:24px;background:#2563eb;border-radius:6px;color:white;font-weight:700;font-size:12px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">1</div>
          <span style="font-size:14px;color:#475569">Acesse o painel admin e configure sua organização (cor, ciclo ativo)</span>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:8px;align-items:flex-start">
          <div style="width:24px;height:24px;background:#2563eb;border-radius:6px;color:white;font-weight:700;font-size:12px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">2</div>
          <span style="font-size:14px;color:#475569">Importe seus colaboradores via CSV (usuários e avaliados)</span>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:8px;align-items:flex-start">
          <div style="width:24px;height:24px;background:#2563eb;border-radius:6px;color:white;font-weight:700;font-size:12px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">3</div>
          <span style="font-size:14px;color:#475569">Configure as atribuições (quem avalia quem)</span>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="width:24px;height:24px;background:#059669;border-radius:6px;color:white;font-weight:700;font-size:12px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">4</div>
          <span style="font-size:14px;color:#475569">Lance o ciclo! Envie os links para sua equipe.</span>
        </div>
      </div>
      <!-- BOTÕES -->
      <div style="text-align:center;margin-bottom:24px">
        <a href="${loginUrl}" style="background:#2563eb;color:white;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;margin-bottom:12px">Acessar o painel →</a>
      </div>
      <!-- MANUAIS -->
      <div style="background:#f8faff;border-radius:12px;padding:16px 20px;margin-bottom:24px">
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:10px">📚 Materiais de apoio</div>
        <a href="${manualAdminUrl}" style="display:block;color:#2563eb;font-size:14px;margin-bottom:6px">→ Manual do Administrador (guia completo)</a>
        <a href="${manualUserUrl}" style="display:block;color:#2563eb;font-size:14px">→ Guia do Colaborador (para enviar à equipe)</a>
      </div>
      <p style="font-size:14px;color:#475569;line-height:1.7">
        Dúvidas? Estamos disponíveis pelo WhatsApp <a href="https://wa.me/5511986096470" style="color:#2563eb">(11) 98609-6470</a> ou pelo email <a href="mailto:avalie360@conectandogente.com" style="color:#2563eb">avalie360@conectandogente.com</a>.
      </p>
    </div>
    <div style="background:#f1f5f9;padding:16px 36px;text-align:center;font-size:12px;color:#94a3b8">
      Avalie360 · Conectando Gente · Em conformidade com a LGPD
    </div>
  </div>
</body>
</html>`;

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Avalie360 <avalie360@conectandogente.com>',
        to: adminEmail,
        subject: `✅ Avalie360 — Sua conta está pronta, ${adminName.split(' ')[0]}!`,
        html: emailHtml,
      }),
    });

    if (!emailRes.ok) {
      const emailErr = await emailRes.text();
      console.error('Resend error:', emailErr);
    } else {
      console.log(`✅ Email de boas-vindas enviado para ${adminEmail}`);
    }
  } catch (emailErr) {
    console.error('Email send error:', emailErr);
    // Não retorna erro — a org já foi criada, email é secundário
  }

  return res.status(200).json({ received: true });
};
