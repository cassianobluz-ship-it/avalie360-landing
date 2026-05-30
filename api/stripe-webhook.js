// /api/stripe-webhook.js
// IMPORTANTE: precisa do body raw para verificar assinatura do Stripe

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Desabilita o bodyParser padrão da Vercel para esta rota
export const config = {
  api: {
    bodyParser: false,
  },
};

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateOrgId(slug) {
  return `${slug}-${Math.random().toString(36).substring(2, 10)}`;
}

// Lê o body como buffer raw
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const { orgName, orgSlug, adminName, adminEmail, numColabs } = session.metadata;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // Verifica se slug já existe
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();

  if (existing) {
    console.log(`Org ${orgSlug} já existe.`);
    return res.status(200).json({ received: true });
  }

  const adminPassword = generatePassword(12);
  const orgId = generateOrgId(orgSlug);

  const { error: orgError } = await supabase
    .from('organizations')
    .insert({
      id: orgId,
      name: orgName,
      slug: orgSlug,
      admin_password: adminPassword,
      primary_color: '#2563eb',
      logo_url: '',
      base_url: 'https://avalie360.vercel.app',
      active_ciclo: '2026 - 1º Semestre',
      scale_labels: {"0":"Não sei avaliar","1":"Raramente","2":"Às vezes","3":"Frequentemente","4":"Sempre"},
      resend_from_email: 'avalie360@conectandogente.com',
      telegram_bot_token: '',
      telegram_chat_ids: [],
      ciclo_deadline: {},
      notify_email: true,
      notify_telegram: false,
      reminder_days: 3,
      scale_model: 'frequencia',
      yesno_labels: {"0":"Não","1":"Sim","2":"Atenção"},
    });

  if (orgError) {
    console.error('Supabase insert error:', orgError);
    return res.status(500).json({ error: 'Erro ao criar organização' });
  }

  console.log(`✅ Organização criada: ${orgSlug}`);

  // Email via Resend
  const loginUrl = `https://avalie360.vercel.app/${orgSlug}/login`;

  const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f9ff;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(37,99,235,.1)">
    <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:32px 36px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:white">Avalie360</div>
      <div style="color:rgba(255,255,255,.75);font-size:14px;margin-top:6px">Sua conta foi criada com sucesso!</div>
    </div>
    <div style="padding:32px 36px">
      <p style="font-size:16px;color:#0f172a;margin-bottom:8px">Olá, <strong>${adminName}</strong>! 👋</p>
      <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:24px">
        O pagamento foi confirmado e sua organização <strong>${orgName}</strong> está pronta para usar.
      </p>
      <div style="background:#eff6ff;border-radius:12px;padding:20px 24px;margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">CREDENCIAIS DE ADMINISTRADOR</div>
        <div style="margin-bottom:12px">
          <span style="font-size:13px;color:#475569">URL de acesso:</span><br>
          <a href="${loginUrl}" style="font-size:15px;font-weight:700;color:#2563eb">${loginUrl}</a>
        </div>
        <div style="margin-bottom:12px">
          <span style="font-size:13px;color:#475569">Identificador da organização:</span><br>
          <strong style="font-size:15px;color:#0f172a">${orgSlug}</strong>
        </div>
        <div>
          <span style="font-size:13px;color:#475569">Senha de administrador:</span><br>
          <strong style="font-size:18px;color:#0f172a;font-family:monospace;background:#e2e8f0;padding:4px 10px;border-radius:6px">${adminPassword}</strong>
        </div>
      </div>
      <p style="font-size:13px;color:#94a3b8;margin-bottom:24px">⚠️ Salve esta senha em local seguro.</p>
      <div style="margin-bottom:24px">
        <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:12px">Próximos passos:</div>
        <div style="margin-bottom:8px;font-size:14px;color:#475569">1️⃣ Acesse o painel admin e configure sua organização</div>
        <div style="margin-bottom:8px;font-size:14px;color:#475569">2️⃣ Importe seus colaboradores via CSV</div>
        <div style="margin-bottom:8px;font-size:14px;color:#475569">3️⃣ Configure as atribuições (quem avalia quem)</div>
        <div style="font-size:14px;color:#475569">4️⃣ Lance o ciclo e envie os links para sua equipe!</div>
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${loginUrl}" style="background:#2563eb;color:white;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Acessar o painel →</a>
      </div>
      <p style="font-size:14px;color:#475569;line-height:1.7">
        Dúvidas? WhatsApp <a href="https://wa.me/5511986096470" style="color:#2563eb">(11) 98609-6470</a> ou <a href="mailto:avalie360@conectandogente.com" style="color:#2563eb">avalie360@conectandogente.com</a>
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
    if (!emailRes.ok) console.error('Resend error:', await emailRes.text());
    else console.log(`✅ Email enviado para ${adminEmail}`);
  } catch (emailErr) {
    console.error('Email error:', emailErr);
  }

  return res.status(200).json({ received: true });
}
