// /api/create-checkout-custom.js
// Cria sessão Stripe para contratação do Plano Personalizado (R$300/ciclo)

const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId, orgName, orgSlug, adminEmail } = req.body;
  if (!orgId || !orgName || !orgSlug) return res.status(400).json({ error: 'Campos obrigatórios faltando' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://avalie360.vercel.app';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: 'Avalie360 — Plano Personalizado',
            description: `Personalização de formulários · ${orgName} · por ciclo`,
          },
          unit_amount: 30000, // R$300,00
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: adminEmail || undefined,
      success_url: `${appUrl}/${orgSlug}/login?custom_upgrade=1`,
      cancel_url: `${appUrl}/${orgSlug}/login`,
      metadata: {
        type: 'plan_custom',
        orgId,
        orgName,
        orgSlug,
        adminEmail: adminEmail || '',
      },
      payment_intent_data: {
        metadata: { type: 'plan_custom', orgId, orgSlug },
      },
    });

    res.status(200).json({ sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
