// /api/validate-cupom.js
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
  const { codigo, contexto } = body; // contexto: 'contratacao' | 'upgrade'

  if (!codigo) return res.status(400).json({ valido: false, erro: 'Código não informado' });

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data: cupom } = await supabase
      .from('cupons')
      .select('*')
      .eq('codigo', codigo.toUpperCase().trim())
      .eq('ativo', true)
      .single();

    if (!cupom) return res.status(200).json({ valido: false, erro: 'Cupom não encontrado ou inativo.' });

    // Verificar contexto
    if (contexto && cupom.aplicavel_em !== 'ambos' && cupom.aplicavel_em !== contexto) {
      return res.status(200).json({ valido: false, erro: 'Este cupom não é válido para este tipo de compra.' });
    }

    // Verificar limite de usos
    if (cupom.usos_max !== null && cupom.usos >= cupom.usos_max) {
      return res.status(200).json({ valido: false, erro: 'Este cupom atingiu o limite de usos.' });
    }

    return res.status(200).json({
      valido: true,
      id: cupom.id,
      codigo: cupom.codigo,
      desconto_pct: cupom.desconto_pct,
      aplicavel_em: cupom.aplicavel_em,
    });
  } catch(e) {
    console.error('validate-cupom error:', e);
    return res.status(500).json({ valido: false, erro: 'Erro interno ao validar cupom.' });
  }
};
