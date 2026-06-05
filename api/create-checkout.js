// /api/create-checkout.js
const Stripe = require('stripe');

// Parser manual de body JSON (Vercel às vezes não parseia automaticamente)
async function parseBody(req) {
  return new Promise((resolve) => {
    // Se já foi parseado pelo middleware da Vercel
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body);
    }
    // Parser manual para raw body
    let data = '';
    req.on('data', chunk => { data += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch(e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await parseBody(req);
  const { orgName, orgSlug, adminName, adminEmail, numColabs, orgType, cupomCode } = body;

  console.log('create-checkout received:', { orgName, orgSlug, adminName, adminEmail, numColabs, orgType, cupomCode: cupomCode || 'none' });

  if (!orgName || !orgSlug || !adminName || !adminEmail || !numColabs) {
    console.log('Campos faltando:', JSON.stringify({ orgName: !!orgName, orgSlug: !!orgSlug, adminName: !!adminName, adminEmail: !!adminEmail, numColabs: !!numColabs }));
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://avalie360.vercel.app';

  // Verificar cupom de desconto parcial (100% já tratado no frontend via /api/create-org-free)
  let descontoPct = 0;
  if (cupomCode) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: cupom } = await supabase
        .from('cupons')
        .select('*')
        .eq('codigo', cupomCode.toUpperCase())
        .eq('ativo', true)
        .in('aplicavel_em', ['contratacao', 'ambos'])
        .single();
      if (cupom && (cupom.usos_max === null || cupom.usos < cupom.usos_max)) {
        descontoPct = cupom.desconto_pct;
        // Incrementar uso
        await supabase.from('cupons').update({ usos: (cupom.usos || 0) + 1 }).eq('id', cupom.id);
      }
    } catch(e) { console.error('Erro ao verificar cupom:', e.message); }
  }

  const totalBruto = 1500 * parseInt(numColabs);
  const totalAmount = descontoPct > 0 ? Math.round(totalBruto * (1 - descontoPct / 100)) : totalBruto;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: 'Avalie360 — Ciclo de Avaliação 360°',
            description: `${numColabs} colaboradores avaliados · ${orgName}`,
          },
          unit_amount: totalAmount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: adminEmail,
      success_url: `${appUrl}?success=1&email=${encodeURIComponent(adminEmail)}&slug=${encodeURIComponent(orgSlug)}`,
      cancel_url: `https://avalie360.conectandogente.com/#contratar`,
      metadata: {
        orgName,
        orgSlug,
        adminName,
        adminEmail,
        numColabs: String(numColabs),
        orgType: orgType || 'religiosa',
        cupomCode: cupomCode || '',
      },
    });

    console.log('Sessão Stripe criada:', session.id);
    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
