// /api/create-checkout-custom.js
const Stripe = require('stripe');

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
  const { orgId, orgName, orgSlug, adminEmail } = body;

  console.log('create-checkout-custom received:', { orgId, orgName, orgSlug, adminEmail });

  if (!orgId || !orgName || !orgSlug) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  // success_url aponta para tela inicial do app com parâmetro de upgrade
  const appUrl = 'https://avalie360.vercel.app';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: 'Avalie360 — Plano Personalizado',
            description: `Personalização de formulários · ${orgName} · por ciclo de avaliação`,
          },
          unit_amount: 30000,
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: adminEmail || undefined,
      success_url: `${appUrl}?custom_upgrade=1&org=${encodeURIComponent(orgSlug)}`,
      cancel_url: `${appUrl}`,
      metadata: {
        type: 'plan_custom',
        orgId,
        orgName,
        orgSlug,
        adminEmail: adminEmail || '',
      },
    });

    console.log('Sessão Stripe criada:', session.id);
    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
