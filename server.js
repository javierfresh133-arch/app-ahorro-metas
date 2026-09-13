require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------
// FUNCIONES YA EXISTENTES (cálculo del plan de ahorro)
// ---------------------------------------------------------

function calcularPlan({ montoObjetivo, dineroInicial, ahorroMensual, plazoMeses }) {
  const restante = Math.max(montoObjetivo - dineroInicial, 0);
  const porcentajeProgreso = montoObjetivo > 0
    ? Math.min((dineroInicial / montoObjetivo) * 100, 100)
    : 0;

  const ahorroPorMesNecesario = plazoMeses > 0 ? restante / plazoMeses : restante;
  const ahorroPorSemanaNecesario = ahorroPorMesNecesario / 4.33;
  const ahorroPorDiaNecesario = ahorroPorMesNecesario / 30;

  let mesesEstimados = null;
  if (ahorroMensual > 0) {
    mesesEstimados = Math.ceil(restante / ahorroMensual);
  }

  const esAlcanzable = ahorroMensual >= ahorroPorMesNecesario;

  const alternativas = [];
  if (!esAlcanzable) {
    const ahorroSugerido = Math.ceil(ahorroPorMesNecesario);
    const plazoSugerido = ahorroMensual > 0 ? Math.ceil(restante / ahorroMensual) : null;
    const montoAlternativo = Math.round(dineroInicial + ahorroMensual * plazoMeses);

    alternativas.push(`Aumentar el ahorro mensual a $${ahorroSugerido.toLocaleString('es-AR')}`);
    if (plazoSugerido) {
      alternativas.push(`Extender el plazo a ${plazoSugerido} meses`);
    }
    alternativas.push(`Reducir la meta a $${montoAlternativo.toLocaleString('es-AR')}`);
  }

  return {
    restante: Math.round(restante),
    ahorroPorMesNecesario: Math.round(ahorroPorMesNecesario),
    ahorroPorSemanaNecesario: Math.round(ahorroPorSemanaNecesario),
    ahorroPorDiaNecesario: Math.round(ahorroPorDiaNecesario),
    porcentajeProgreso: Math.round(porcentajeProgreso * 10) / 10,
    mesesEstimados,
    esAlcanzable,
    alternativas
  };
}

app.post('/api/calcular', (req, res) => {
  const { montoObjetivo, dineroInicial, ahorroMensual, plazoMeses } = req.body;

  if (
    typeof montoObjetivo !== 'number' ||
    typeof dineroInicial !== 'number' ||
    typeof ahorroMensual !== 'number' ||
    typeof plazoMeses !== 'number'
  ) {
    return res.status(400).json({ error: 'Faltan datos o tienen un formato inválido.' });
  }

  const plan = calcularPlan({ montoObjetivo, dineroInicial, ahorroMensual, plazoMeses });
  res.json(plan);
});

// ---------------------------------------------------------
// NUEVO: análisis motivador de la meta con IA (Gemini)
// ---------------------------------------------------------

const PROMPT_ANALISIS = `Sos un asistente financiero breve y motivador. Analizá esta meta de ahorro y escribí un mensaje corto (máximo 4 líneas) para el usuario.

Datos:
- Objetivo: {OBJETIVO}
- Monto objetivo: \${MONTO_OBJETIVO}
- Dinero que ya tiene: \${DINERO_INICIAL}
- Puede ahorrar por mes: \${AHORRO_MENSUAL}
- Plazo que quiere: {PLAZO_MESES} meses
- ¿Es alcanzable en ese plazo con ese ahorro?: {ES_ALCANZABLE}
- Tiempo real estimado con su ahorro actual: {MESES_ESTIMADOS} meses

Si es alcanzable, felicitalo y motivalo a mantener el ritmo.
Si NO es alcanzable, sé honesto pero alentador, y sugerí de forma breve qué podría ajustar (ahorrar un poco más por mes, o extender el plazo).
No repitas los números tal cual, hablá en tono cercano y humano, como un amigo que sabe de finanzas.

Respondé solo con el mensaje, sin títulos ni formato adicional.`;

app.post('/api/analizar', async (req, res) => {
  const { objetivo, montoObjetivo, dineroInicial, ahorroMensual, plazoMeses, plan } = req.body;

  if (
    typeof objetivo !== 'string' ||
    typeof montoObjetivo !== 'number' ||
    typeof dineroInicial !== 'number' ||
    typeof ahorroMensual !== 'number' ||
    typeof plazoMeses !== 'number' ||
    !plan
  ) {
    return res.status(400).json({ error: 'Faltan datos para analizar la meta.' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Falta configurar la clave de IA (GEMINI_API_KEY) en el servidor.' });
  }

  const prompt = PROMPT_ANALISIS
    .replace('{OBJETIVO}', objetivo)
    .replace('{MONTO_OBJETIVO}', montoObjetivo)
    .replace('{DINERO_INICIAL}', dineroInicial)
    .replace('{AHORRO_MENSUAL}', ahorroMensual)
    .replace('{PLAZO_MESES}', plazoMeses)
    .replace('{ES_ALCANZABLE}', plan.esAlcanzable ? 'Sí' : 'No')
    .replace('{MESES_ESTIMADOS}', plan.mesesEstimados ?? 'desconocido');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error de Gemini:', errorBody);
      return res.status(502).json({ error: 'La IA no pudo generar el análisis. Probá de nuevo.' });
    }

    const data = await response.json();
    const mensajeIa = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    res.json({ mensaje: mensajeIa });
  } catch (error) {
    console.error('Error al conectar con la IA:', error);
    res.status(500).json({ error: 'Hubo un problema al conectar con la IA.' });
  }
});

app.listen(PORT, () => {
  console.log(`App de ahorro corriendo en http://localhost:${PORT}`);
});
