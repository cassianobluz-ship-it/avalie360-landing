// /api/create-checkout.js
// Vercel Serverless Function — cria sessão Stripe Checkout
// Variáveis de ambiente necessárias na Vercel:
//   STRIPE_SECRET_KEY=sk_test_...
//   NEXT_PUBLIC_APP_URL=https://avalie360.vercel.app  (ou seu domínio)

const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgName, orgSlug, adminName, adminEmail, numColabs } = req.body;

  if (!orgName || !orgSlug || !adminName || !adminEmail || !numColabs) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://avalie360.vercel.app';
  const unitAmount = 1500; // R$15,00 em centavos
  const totalAmount = unitAmount * parseInt(numColabs);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      // PIX: adicionar 'boleto' quando conta de produção estiver ativa
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Avalie360 — Ciclo de Avaliação 360°`,
            description: `${numColabs} colaboradores avaliados · ${orgName}`,
            images: [],
          },
          unit_amount: totalAmount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: adminEmail,
      success_url: `${appUrl}?success=1&email=${encodeURIComponent(adminEmail)}&slug=${encodeURIComponent(orgSlug)}`,
      cancel_url: `${appUrl}#contratar`,
      metadata: {
        orgName,
        orgSlug,
        adminName,
        adminEmail,
        numColabs: String(numColabs),
      },
      payment_intent_data: {
        metadata: { orgName, orgSlug, adminName, adminEmail, numColabs: String(numColabs) },
      },
    });

    res.status(200).json({ sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
