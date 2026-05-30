const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

export const config = { api: { bodyParser: false } };

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateOrgId(slug) {
  return `${slug}-${Math.random().toString(36).substring(2, 10)}`;
}

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
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const { orgName, orgSlug, adminName, adminEmail, numColabs } = session.metadata;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

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

  // Senha em texto puro — app compara diretamente (linha 1308 do App.jsx)
  const adminPassword = generatePassword(12);
  const orgId = generateOrgId(orgSlug);

  console.log(`Criando org: ${orgSlug} | senha: ${adminPassword}`);

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

  // URL do painel admin — tela inicial do app, não login de usuário
  const appUrl = 'https://avalie360.vercel.app';
  const userLoginUrl = `https://avalie360.vercel.app/${orgSlug}/login`;

  const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f9ff;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(37,99,235,.1)">
    
    <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:32px 36px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:white">Avalie360</div>
      <div style="color:rgba(255,255,255,.75);font-size:14px;margin-top:6px">Sua conta foi criada com sucesso! 🎉</div>
    </div>

    <div style="padding:32px 36px">
      <p style="font-size:16px;color:#0f172a;margin-bottom:8px">Olá, <strong>${adminName}</strong>! 👋</p>
      <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:24px">
        O pagamento foi confirmado e sua organização <strong>${orgName}</strong> está pronta para uso. Abaixo estão suas credenciais de administrador.
      </p>

      <!-- CREDENCIAIS ADMIN -->
      <div style="background:#eff6ff;border-radius:12px;padding:20px 24px;margin-bottom:24px;border-left:4px solid #2563eb">
        <div style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px">🔐 Credenciais de Administrador</div>
        <div style="margin-bottom:10px">
          <span style="font-size:13px;color:#64748b">Identificador da organização:</span><br>
          <strong style="font-size:15px;color:#0f172a">${orgSlug}</strong>
        </div>
        <div>
          <span style="font-size:13px;color:#64748b">Senha do administrador:</span><br>
          <strong style="font-size:20px;color:#1e40af;font-family:monospace;background:#dbeafe;padding:6px 14px;border-radius:6px;display:inline-block;margin-top:4px;letter-spacing:1px">${adminPassword}</strong>
        </div>
      </div>

      <p style="font-size:13px;color:#f59e0b;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:24px">
        ⚠️ <strong>Salve esta senha agora</strong> — ela não será exibida novamente. Você pode alterá-la depois no painel de configurações.
      </p>

      <!-- COMO ACESSAR -->
      <div style="background:#f8faff;border-radius:12px;padding:20px 24px;margin-bottom:24px;border:1px solid #e2e8f0">
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:14px">📋 Como acessar o painel de administrador:</div>
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start">
          <div style="width:22px;height:22px;background:#2563eb;border-radius:50%;color:white;font-weight:700;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">1</div>
          <span style="font-size:14px;color:#475569">Acesse <a href="${appUrl}" style="color:#2563eb;font-weight:600">${appUrl}</a></span>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start">
          <div style="width:22px;height:22px;background:#2563eb;border-radius:50%;color:white;font-weight:700;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">2</div>
          <span style="font-size:14px;color:#475569">Clique em <strong>"Acessar painel"</strong></span>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start">
          <div style="width:22px;height:22px;background:#2563eb;border-radius:50%;color:white;font-weight:700;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">3</div>
          <span style="font-size:14px;color:#475569">Selecione <strong>${orgName}</strong> na lista</span>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="width:22px;height:22px;background:#2563eb;border-radius:50%;color:white;font-weight:700;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">4</div>
          <span style="font-size:14px;color:#475569">Digite a senha acima e clique em <strong>"Entrar"</strong></span>
        </div>
      </div>

      <!-- BOTÃO -->
      <div style="text-align:center;margin-bottom:28px">
        <a href="${appUrl}" style="background:#2563eb;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
          Acessar o painel →
        </a>
      </div>

      <!-- PRÓXIMOS PASSOS -->
      <div style="margin-bottom:24px">
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:12px">🚀 Próximos passos após entrar:</div>
        <div style="margin-bottom:8px;font-size:14px;color:#475569">1️⃣ Configure sua organização (cor, ciclo ativo) em <strong>⚙️ Config</strong></div>
        <div style="margin-bottom:8px;font-size:14px;color:#475569">2️⃣ Importe seus colaboradores via CSV em <strong>👥 Usuários</strong></div>
        <div style="margin-bottom:8px;font-size:14px;color:#475569">3️⃣ Configure as atribuições em <strong>🔗 Atribuições</strong></div>
        <div style="font-size:14px;color:#475569">4️⃣ Lance o ciclo! O link para seus colaboradores é: <a href="${userLoginUrl}" style="color:#2563eb">${userLoginUrl}</a></div>
      </div>

      <p style="font-size:14px;color:#475569;line-height:1.7;border-top:1px solid #f1f5f9;padding-top:20px">
        Dúvidas? Estamos disponíveis pelo WhatsApp <a href="https://wa.me/5511986096470" style="color:#2563eb">(11) 98609-6470</a> ou pelo email <a href="mailto:avalie360@conectandogente.com" style="color:#2563eb">avalie360@conectandogente.com</a>.
      </p>
    </div>

    <div style="background:#f1f5f9;padding:16px 36px;text-align:center;font-size:12px;color:#94a3b8">
      Avalie360 · Conectando Gente · Em conformidade com a LGPD · Lei nº 13.709/2018
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
